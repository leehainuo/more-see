from fastapi import APIRouter

from app.api.admin_cost_routes import router as admin_cost_router
from app.api.auth_routes import router as auth_router
from app.api.public import router as public_router
from app.api.session_routes import router as session_router
from app.services import provider_health_service

router = APIRouter()
# 保留兼容导出，便于既有测试或外部 monkeypatch 仍通过 app.api.http 注入 provider health 实现。
get_provider_health = provider_health_service.get_provider_health
router.include_router(public_router)
router.include_router(auth_router)
router.include_router(session_router)
router.include_router(admin_cost_router)
