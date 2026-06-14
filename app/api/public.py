from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.api.http_common import TtsSynthesizeRequest
from app.config import settings
from app.services.provider_health_service import get_provider_health
from app.services.tts_service import tts_service

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}


@router.get("/healthz/providers")
async def provider_healthz(probe: bool = Query(default=False)) -> dict[str, object]:
    # 通过 http 模块间接解析 provider health，兼容既有测试对 app.api.http 的 monkeypatch 入口。
    from app.api import http as http_api

    provider_health = getattr(http_api, "get_provider_health", get_provider_health)
    return await provider_health(probe=probe)


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
