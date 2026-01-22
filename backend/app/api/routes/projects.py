from fastapi import APIRouter

from app.api.deps import CurrentUser

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects(current_user: CurrentUser) -> dict:
    return {
        "user": {"id": current_user.id, "email": current_user.email},
        "projects": [
            {"id": 1, "name": "Demo проект"},
            {"id": 2, "name": "Пилотная аналитика"},
        ],
    }
