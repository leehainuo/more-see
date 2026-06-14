from fastapi import APIRouter

from app.routers.admin_costs import router as admin_cost_router
from app.routers.auth import router as auth_router
from app.routers.public import router as public_router
from app.routers.sessions import router as session_router

router = APIRouter()
router.include_router(public_router)
router.include_router(auth_router)
router.include_router(session_router)
router.include_router(admin_cost_router)
