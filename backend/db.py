"""SQLAlchemy engine bound to DATABASE_URL (default sqlite:///./freshcart.db)."""

from __future__ import annotations

import os
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


DEFAULT_DATABASE_URL = "sqlite:///./freshcart.db"

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


class Base(DeclarativeBase):
    pass


def _database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL).strip() or DEFAULT_DATABASE_URL


def _engine_kwargs(database_url: str) -> dict:
    kwargs: dict = {}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in database_url:
            kwargs["poolclass"] = StaticPool
    return kwargs


def _enable_sqlite_foreign_keys(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def reset_engine(database_url: str | None = None) -> Engine:
    """Replace the process-wide engine. Used by tests with an in-memory SQLite URL."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    url = database_url or _database_url()
    _engine = create_engine(url, **_engine_kwargs(url))
    _enable_sqlite_foreign_keys(_engine)
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        reset_engine()
    assert _engine is not None
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    if _SessionLocal is None:
        reset_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def get_db() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create R1 tables if they are missing. Alembic ownership stays with FE-5."""
    import models  # noqa: F401 — register metadata

    Base.metadata.create_all(bind=get_engine())
