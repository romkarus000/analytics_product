from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.health import HealthResponse
from app.services.health import check_database, check_redis

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health(db: Session = Depends(get_db)) -> HealthResponse:
    database_ok = check_database(db)
    redis_ok = check_redis()
    status = "ok" if database_ok and redis_ok else "degraded"
    return HealthResponse(status=status, database=database_ok, redis=redis_ok)
