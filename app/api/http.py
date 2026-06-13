from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.config import settings
from app.auth.deps import get_current_user_id
from app.auth.security import create_access_token, hash_password, verify_password
from app.persistence.repository import persistence_repository
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
    return JSONResponse(content={"userId": user.id, "username": user.username})


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
    result = JSONResponse(content={"userId": user.id, "username": user.username})
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
    return JSONResponse(content={"userId": user_id})


@router.get("/api/sessions")
async def list_sessions(user_id: int = Depends(get_current_user_id)) -> JSONResponse:
    rows = await persistence_repository.list_sessions(user_id=user_id, limit=50, offset=0)
    return JSONResponse(
        content={
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
