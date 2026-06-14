from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.serializers.responses import serialize_auth_user
from app.schemas.requests import AuthLoginRequest, AuthRegisterRequest
from app.deps.auth import get_current_user_id
from app.core.security import create_access_token, hash_password, verify_password
from app.core.config import settings
from app.persistence.repository import persistence_repository

router = APIRouter()


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
    return JSONResponse(content=serialize_auth_user(user))


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
    result = JSONResponse(content=serialize_auth_user(user))
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
    return JSONResponse(content=serialize_auth_user(user))
