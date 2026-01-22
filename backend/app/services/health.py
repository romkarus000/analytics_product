from sqlalchemy import text
from sqlalchemy.orm import Session
import redis

from app.core.config import get_settings

settings = get_settings()


def check_database(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def check_redis() -> bool:
    try:
        client = redis.Redis.from_url(settings.redis_url)
        return bool(client.ping())
    except Exception:
        return False
