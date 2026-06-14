from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.deps.filters import normalize_optional_text, parse_date_boundary
from app.serializers.responses import serialize_session_detail, serialize_session_list_response
from app.deps.auth import get_current_user_id
from app.persistence.repository import persistence_repository

router = APIRouter()


@router.get("/api/sessions")
async def list_sessions(
    user_id: int = Depends(get_current_user_id),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=50),
    query: str | None = Query(default=None, max_length=64),
    inputSource: str | None = Query(default=None, pattern="^(camera|screen)$"),
    status: str | None = Query(default=None, pattern="^(active|ended)$"),
    updatedFrom: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    updatedTo: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
) -> JSONResponse:
    normalized_query = normalize_optional_text(query)
    updated_from = parse_date_boundary(updatedFrom, is_end=False)
    updated_to = parse_date_boundary(updatedTo, is_end=True)
    total = await persistence_repository.count_sessions(
        user_id=user_id,
        query=normalized_query,
        input_source=inputSource,
        status=status,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    offset = (page - 1) * pageSize
    rows = await persistence_repository.list_sessions(
        user_id=user_id,
        limit=pageSize,
        offset=offset,
        query=normalized_query,
        input_source=inputSource,
        status=status,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    return JSONResponse(content=serialize_session_list_response(page=page, page_size=pageSize, total=total, rows=rows))


@router.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str, user_id: int = Depends(get_current_user_id)) -> JSONResponse:
    row = await persistence_repository.get_session_detail(user_id=user_id, session_id=session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return JSONResponse(content=serialize_session_detail(row))


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, user_id: int = Depends(get_current_user_id)) -> JSONResponse:
    deleted = await persistence_repository.delete_session(user_id=user_id, session_id=session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="会话不存在")
    return JSONResponse(content={"ok": True, "sessionId": session_id})
