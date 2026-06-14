from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.api.query_filters import normalize_optional_text, parse_date_boundary
from app.api.response_serializers import serialize_admin_cost_session_detail, serialize_admin_cost_session_item
from app.auth.deps import require_super_user_id
from app.persistence.repository import persistence_repository

router = APIRouter()


@router.get("/api/admin/costs/sessions")
async def list_cost_sessions(
    _user_id: int = Depends(require_super_user_id),
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
    total = await persistence_repository.count_all_sessions(
        query=normalized_query,
        input_source=inputSource,
        status=status,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    offset = (page - 1) * pageSize
    rows = await persistence_repository.list_all_sessions_with_details(
        limit=pageSize,
        offset=offset,
        query=normalized_query,
        input_source=inputSource,
        status=status,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    return JSONResponse(
        content={
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "items": [serialize_admin_cost_session_item(row) for row in rows],
        }
    )


@router.get("/api/admin/costs/sessions/{session_id}")
async def get_cost_session_detail(session_id: str, _user_id: int = Depends(require_super_user_id)) -> JSONResponse:
    row = await persistence_repository.get_session_detail_admin(session_id=session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return JSONResponse(content=serialize_admin_cost_session_detail(row))
