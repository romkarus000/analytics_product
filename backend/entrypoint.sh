#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
import os
import time

from sqlalchemy import create_engine

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is not set")

engine = create_engine(database_url, pool_pre_ping=True)
deadline = time.time() + 30

while True:
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        break
    except Exception as exc:  # pragma: no cover - startup wait loop
        if time.time() > deadline:
            raise exc
        time.sleep(1)

PY

alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
