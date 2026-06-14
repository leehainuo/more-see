from fastapi import APIRouter

from app.api.admin_cost_routes import router as admin_cost_router
from app.api.auth_routes import router as auth_router
from app.api.public_routes import router as public_router
from app.api.session_routes import router as session_router

router = APIRouter()
router.include_router(public_router)
router.include_router(auth_router)
router.include_router(session_router)
router.include_router(admin_cost_router)
