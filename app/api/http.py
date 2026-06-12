from fastapi import APIRouter

from app.config import settings

router = APIRouter()


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
