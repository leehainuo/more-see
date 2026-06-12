import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.http import router as http_router
from app.api.ws import router as ws_router
from app.config import settings
from app.services.provider_health_service import log_provider_health_snapshot

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await log_provider_health_snapshot()
    except Exception as exc:
        logger.warning("failed to log provider health snapshot: %s", exc)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, debug=settings.app_debug, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
            "http://localhost:4173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(http_router)
    app.include_router(ws_router)
    return app


app = create_app()
