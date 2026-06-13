from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.config import settings
from app.auth.deps import get_current_user_id, require_super_user_id
from app.auth.security import create_access_token, hash_password, verify_password
from app.persistence.repository import persistence_repository
from app.services.cost_service import estimate_asr_cost_yuan, estimate_tts_cost_yuan
from app.services.provider_health_service import get_provider_health
from app.services.tts_service import tts_service

router = APIRouter()


class TtsSynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)

class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)


class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}


@router.get("/healthz/providers")
async def provider_healthz(probe: bool = Query(default=False)) -> dict[str, object]:
    return await get_provider_health(probe=probe)


@router.get("/api/config/public")
async def public_config() -> dict[str, str]:
    return {
        "appName": settings.app_name,
        "environment": settings.app_env,
        "frontendMode": "react-shadcn",
    }


@router.post("/api/tts/synthesize")
async def synthesize_tts(payload: TtsSynthesizeRequest) -> JSONResponse:
    result = await tts_service.synthesize(payload.text)
    return JSONResponse(content=result)


@router.post("/api/auth/register")
async def register(payload: AuthRegisterRequest) -> JSONResponse:
    if not settings.auth_allow_register:
        raise HTTPException(status_code=403, detail="当前环境不允许注册")
    existing = await persistence_repository.get_user_by_username(username=payload.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = await persistence_repository.create_user(
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    if user is None:
        raise HTTPException(status_code=500, detail="注册失败")
    return JSONResponse(content={"userId": user.id, "username": user.username, "isSuper": int(user.is_super)})


@router.post("/api/auth/login")
async def login(payload: AuthLoginRequest) -> JSONResponse:
    user = await persistence_repository.get_user_by_username(username=payload.username)
    if user is None:
        user = await persistence_repository.create_user(
            username=payload.username,
            password_hash=hash_password(payload.password),
        )
        if user is None:
            raise HTTPException(status_code=500, detail="登录失败")
    elif not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(user_id=user.id)
    result = JSONResponse(content={"userId": user.id, "username": user.username, "isSuper": int(user.is_super)})
    result.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.auth_jwt_expire_seconds,
    )
    return result


@router.post("/api/auth/logout")
async def logout() -> JSONResponse:
    result = JSONResponse(content={"ok": True})
    result.delete_cookie(settings.auth_cookie_name)
    return result


@router.get("/api/auth/me")
async def me(user_id: int = Depends(get_current_user_id)) -> JSONResponse:
    user = await persistence_repository.get_user_by_id(user_id=user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="未登录")
    return JSONResponse(content={"userId": user.id, "username": user.username, "isSuper": int(user.is_super)})


@router.get("/api/admin/costs/sessions")
async def list_cost_sessions(
    _user_id: int = Depends(require_super_user_id),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=50),
) -> JSONResponse:
    total = await persistence_repository.count_all_sessions()
    offset = (page - 1) * pageSize
    rows = await persistence_repository.list_all_sessions_with_details(limit=pageSize, offset=offset)
    items = []
    for row in rows:
        turns = sorted(row.turns, key=lambda item: item.created_at)
        frames = sorted(row.frames, key=lambda item: item.created_at)
        asr_duration_ms = sum(int(getattr(turn, "asr_duration_ms", 0) or 0) for turn in turns)
        tts_char_count = sum(int(getattr(turn, "tts_char_count", 0) or 0) for turn in turns)
        items.append(
            {
                "sessionId": row.session_id,
                "inputSource": row.input_source,
                "createdAt": row.created_at.isoformat(),
                "updatedAt": row.updated_at.isoformat(),
                "endedAt": row.ended_at.isoformat() if row.ended_at else None,
                "asrDurationMs": asr_duration_ms,
                "ttsCharCount": tts_char_count,
                "asrCostYuan": estimate_asr_cost_yuan(duration_ms=asr_duration_ms),
                "ttsCostYuan": estimate_tts_cost_yuan(char_count=tts_char_count),
                "visionFrameCount": len(frames),
                "visionCacheHitCount": sum(1 for frame in frames if int(getattr(frame, "cache_hit", 0) or 0) == 1),
            }
        )
    return JSONResponse(content={"page": page, "pageSize": pageSize, "total": total, "items": items})


@router.get("/api/admin/costs/sessions/{session_id}")
async def get_cost_session_detail(session_id: str, _user_id: int = Depends(require_super_user_id)) -> JSONResponse:
    row = await persistence_repository.get_session_detail_admin(session_id=session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    turns = sorted(row.turns, key=lambda item: item.created_at)
    frames = sorted(row.frames, key=lambda item: item.created_at)
    items = []
    session_asr_duration_ms = 0
    session_tts_char_count = 0
    for turn in turns:
        asr_duration_ms = int(getattr(turn, "asr_duration_ms", 0) or 0)
        tts_char_count = int(getattr(turn, "tts_char_count", 0) or 0)
        session_asr_duration_ms += asr_duration_ms
        session_tts_char_count += tts_char_count
        items.append(
            {
                "turnId": turn.turn_id,
                "createdAt": turn.created_at.isoformat(),
                "userText": turn.user_text,
                "assistantText": turn.assistant_text,
                "visionSummary": turn.vision_summary,
                "asrDurationMs": asr_duration_ms,
                "asrProvider": getattr(turn, "asr_provider", None),
                "ttsCharCount": tts_char_count,
                "ttsProvider": getattr(turn, "tts_provider", None),
                "asrCostYuan": estimate_asr_cost_yuan(duration_ms=asr_duration_ms),
                "ttsCostYuan": estimate_tts_cost_yuan(char_count=tts_char_count),
            }
        )
    return JSONResponse(
        content={
            "sessionId": row.session_id,
            "inputSource": row.input_source,
            "createdAt": row.created_at.isoformat(),
            "updatedAt": row.updated_at.isoformat(),
            "endedAt": row.ended_at.isoformat() if row.ended_at else None,
            "asrDurationMs": session_asr_duration_ms,
            "ttsCharCount": session_tts_char_count,
            "asrCostYuan": estimate_asr_cost_yuan(duration_ms=session_asr_duration_ms),
            "ttsCostYuan": estimate_tts_cost_yuan(char_count=session_tts_char_count),
            "visionFrameCount": len(frames),
            "visionCacheHitCount": sum(1 for frame in frames if int(getattr(frame, "cache_hit", 0) or 0) == 1),
            "turns": items,
        }
    )


@router.get("/api/sessions")
async def list_sessions(
    user_id: int = Depends(get_current_user_id),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=50),
) -> JSONResponse:
    total = await persistence_repository.count_sessions(user_id=user_id)
    offset = (page - 1) * pageSize
    rows = await persistence_repository.list_sessions(user_id=user_id, limit=pageSize, offset=offset)
    return JSONResponse(
        content={
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "items": [
                {
                    "sessionId": row.session_id,
                    "inputSource": row.input_source,
                    "createdAt": row.created_at.isoformat(),
                    "updatedAt": row.updated_at.isoformat(),
                    "endedAt": row.ended_at.isoformat() if row.ended_at else None,
                }
                for row in rows
            ]
        }
    )


@router.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str, user_id: int = Depends(get_current_user_id)) -> JSONResponse:
    row = await persistence_repository.get_session_detail(user_id=user_id, session_id=session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    turns = sorted(row.turns, key=lambda item: item.created_at)
    frames = sorted(row.frames, key=lambda item: item.created_at)
    return JSONResponse(
        content={
            "sessionId": row.session_id,
            "inputSource": row.input_source,
            "createdAt": row.created_at.isoformat(),
            "updatedAt": row.updated_at.isoformat(),
            "endedAt": row.ended_at.isoformat() if row.ended_at else None,
            "turns": [
                {
                    "turnId": item.turn_id,
                    "userText": item.user_text,
                    "assistantText": item.assistant_text,
                    "visionSummary": item.vision_summary,
                    "createdAt": item.created_at.isoformat(),
                    "updatedAt": item.updated_at.isoformat(),
                }
                for item in turns
            ],
            "frames": [
                {
                    "frameId": item.frame_id,
                    "inputSource": item.input_source,
                    "width": item.width,
                    "height": item.height,
                    "capturedAt": item.captured_at,
                    "summary": item.summary,
                    "provider": item.provider,
                    "cacheHit": bool(item.cache_hit),
                    "summarizedAt": item.summarized_at,
                    "summaryError": item.summary_error,
                    "createdAt": item.created_at.isoformat(),
                    "updatedAt": item.updated_at.isoformat(),
                }
                for item in frames
            ],
        }
    )
