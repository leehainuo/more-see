from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, WebSocket

from app.core.config import settings
from app.repositories.repository import persistence_repository
from app.core.security import decode_access_token


async def get_current_user_id(token: str | None = Cookie(default=None, alias=settings.auth_cookie_name)) -> int:
    if not token:
        raise HTTPException(status_code=401, detail="未登录")
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="登录已失效")
    return user_id


async def get_current_user(user_id: int = Depends(get_current_user_id)):
    return user_id


async def get_current_user_id_ws(websocket: WebSocket) -> int:
    token = websocket.cookies.get(settings.auth_cookie_name)
    if not token:
        await websocket.close(code=4401)
        raise RuntimeError("unauthorized")
    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=4401)
        raise RuntimeError("unauthorized")
    return user_id


async def require_super_user_id(user_id: int = Depends(get_current_user_id)) -> int:
    user = await persistence_repository.get_user_by_id(user_id=user_id)
    if user is None or int(getattr(user, "is_super", 0)) != 1:
        raise HTTPException(status_code=403, detail="无权限访问")
    return user_id


async def ensure_session_belongs_to_user(*, user_id: int, session_id: str) -> None:
    row = await persistence_repository.get_session_detail(user_id=user_id, session_id=session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
