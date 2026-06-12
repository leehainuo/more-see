from pydantic import BaseModel, Field

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.tts_service import tts_service

router = APIRouter()


class TtsSynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}


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
