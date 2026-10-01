from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine

DEFAULT_DATABASE_URL = "sqlite:///./freshcart.db"
DEFAULT_SAVED_CART_TTL_DAYS = 30
DELETE_BATCH_SIZE = 500
JOB_NAME = "expire-saved-carts"

logger = logging.getLogger(JOB_NAME)


def saved_carts_enabled() -> bool:
    return os.getenv("SAVED_CARTS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def saved_cart_ttl_days() -> int:
    raw = os.getenv("SAVED_CART_TTL_DAYS", str(DEFAULT_SAVED_CART_TTL_DAYS)).strip()
    return int(raw) if raw else DEFAULT_SAVED_CART_TTL_DAYS


def compute_expires_at(
    created_at: datetime,
    ttl_days: Optional[int] = None,
) -> datetime:
    days = saved_cart_ttl_days() if ttl_days is None else ttl_days
    return created_at + timedelta(days=days)


def database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


def create_db_engine(url: Optional[str] = None) -> Engine:
    engine = create_engine(url or database_url())
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def _enable_sqlite_fk(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def expire_saved_carts(
    *,
    now: Optional[datetime] = None,
    engine: Optional[Engine] = None,
    batch_size: int = DELETE_BATCH_SIZE,
) -> int:
    if not saved_carts_enabled():
        return 0

    clock = now or datetime.now(timezone.utc)
    now_iso = _utc_iso(clock)
    own_engine = engine is None
    db = engine or create_db_engine()
    deleted = 0

    try:
        while True:
            with db.begin() as conn:
                result = conn.execute(
                    text(
                        """
                        DELETE FROM saved_carts
                        WHERE id IN (
                            SELECT id FROM saved_carts
                            WHERE expires_at < :now
                            LIMIT :batch_size
                        )
                        """
                    ),
                    {"now": now_iso, "batch_size": batch_size},
                )
                batch_deleted = result.rowcount or 0
            deleted += batch_deleted
            if batch_deleted < batch_size:
                break
    finally:
        if own_engine:
            db.dispose()

    return deleted


def _log_result(deleted: int) -> None:
    payload = {"job": JOB_NAME, "deleted": deleted}
    line = json.dumps(payload)
    logger.info(line)
    print(line, flush=True)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    deleted = expire_saved_carts()
    _log_result(deleted)


if __name__ == "__main__":
    main()
