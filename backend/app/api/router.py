from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.dimensions import router as dimensions_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.insights import router as insights_router
from app.api.routes.mappings import router as mappings_router
from app.api.routes.metrics import router as metrics_router
from app.api.routes.projects import router as projects_router
from app.api.routes.uploads import router as uploads_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(projects_router)
api_router.include_router(uploads_router)
api_router.include_router(mappings_router)
api_router.include_router(dimensions_router)
api_router.include_router(metrics_router)
api_router.include_router(dashboard_router)
api_router.include_router(insights_router)
