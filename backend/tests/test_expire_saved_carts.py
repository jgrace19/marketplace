from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, text

from jobs.expire_saved_carts import (
    DEFAULT_SAVED_CART_TTL_DAYS,
    DELETE_BATCH_SIZE,
    compute_expires_at,
    expire_saved_carts,
    main,
    saved_cart_ttl_days,
)


FIXED_NOW = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)

SCHEMA_SQL = """
CREATE TABLE saved_carts (
    id TEXT PRIMARY KEY,
    shopper_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX ix_saved_carts_shopper_id ON saved_carts (shopper_id);
CREATE INDEX ix_saved_carts_expires_at ON saved_carts (expires_at);

CREATE TABLE saved_cart_items (
    saved_cart_id TEXT NOT NULL REFERENCES saved_carts(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
    unit_price_at_save NUMERIC NOT NULL,
    PRIMARY KEY (saved_cart_id, product_id)
);
"""


def _sql_ts(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _enable_sqlite_fk(engine) -> None:
    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


@pytest.fixture
def engine(tmp_path, monkeypatch):
    db_path = tmp_path / "freshcart.db"
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("SAVED_CARTS_ENABLED", "true")
    monkeypatch.setenv("DATABASE_URL", url)

    engine = create_engine(url)
    _enable_sqlite_fk(engine)
    with engine.begin() as conn:
        for statement in SCHEMA_SQL.split(";"):
            stmt = statement.strip()
            if stmt:
                conn.execute(text(stmt))
    yield engine
    engine.dispose()


def _insert_cart(
    engine,
    *,
    expires_at: datetime,
    created_at: datetime | None = None,
    items: list[tuple[str, int, float]] | None = None,
    shopper_id: str = "shopper-1",
    store_id: str = "wegmans",
    name: str = "Weekly shop",
) -> str:
    cart_id = str(uuid.uuid4())
    created = created_at or (expires_at - timedelta(days=DEFAULT_SAVED_CART_TTL_DAYS))
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO saved_carts
                    (id, shopper_id, store_id, name, created_at, expires_at)
                VALUES
                    (:id, :shopper_id, :store_id, :name, :created_at, :expires_at)
                """
            ),
            {
                "id": cart_id,
                "shopper_id": shopper_id,
                "store_id": store_id,
                "name": name,
                "created_at": _sql_ts(created),
                "expires_at": _sql_ts(expires_at),
            },
        )
        for product_id, quantity, unit_price in items or []:
            conn.execute(
                text(
                    """
                    INSERT INTO saved_cart_items
                        (saved_cart_id, product_id, quantity, unit_price_at_save)
                    VALUES
                        (:saved_cart_id, :product_id, :quantity, :unit_price)
                    """
                ),
                {
                    "saved_cart_id": cart_id,
                    "product_id": product_id,
                    "quantity": quantity,
                    "unit_price": unit_price,
                },
            )
    return cart_id


def _cart_ids(engine) -> set[str]:
    with engine.connect() as conn:
        return set(conn.execute(text("SELECT id FROM saved_carts")).scalars())


def _item_count(engine, cart_id: str | None = None) -> int:
    sql = "SELECT COUNT(*) FROM saved_cart_items"
    params = {}
    if cart_id is not None:
        sql += " WHERE saved_cart_id = :cart_id"
        params["cart_id"] = cart_id
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


def test_ttl_default_is_30_days(monkeypatch):
    monkeypatch.delenv("SAVED_CART_TTL_DAYS", raising=False)
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert saved_cart_ttl_days() == 30
    assert DEFAULT_SAVED_CART_TTL_DAYS == 30
    assert compute_expires_at(created) == datetime(2026, 1, 31, tzinfo=timezone.utc)


def test_ttl_reads_saved_cart_ttl_days(monkeypatch):
    monkeypatch.setenv("SAVED_CART_TTL_DAYS", "7")
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert saved_cart_ttl_days() == 7
    assert compute_expires_at(created) == datetime(2026, 1, 8, tzinfo=timezone.utc)
    assert compute_expires_at(created, ttl_days=14) == datetime(
        2026, 1, 15, tzinfo=timezone.utc
    )


def test_expired_carts_deleted_live_carts_kept(engine):
    expired_id = _insert_cart(
        engine,
        expires_at=FIXED_NOW - timedelta(hours=1),
        items=[("sku-expired", 2, 3.49)],
    )
    live_id = _insert_cart(
        engine,
        expires_at=FIXED_NOW + timedelta(days=10),
        items=[("sku-live", 1, 5.00)],
    )

    deleted = expire_saved_carts(now=FIXED_NOW, engine=engine)

    assert deleted == 1
    assert _cart_ids(engine) == {live_id}
    assert expired_id not in _cart_ids(engine)
    assert _item_count(engine, live_id) == 1


def test_items_cascade_when_cart_expires(engine):
    expired_id = _insert_cart(
        engine,
        expires_at=FIXED_NOW - timedelta(days=1),
        items=[("milk", 2, 4.50), ("eggs", 1, 3.25)],
    )
    live_id = _insert_cart(
        engine,
        expires_at=FIXED_NOW + timedelta(days=1),
        items=[("bread", 1, 2.99)],
    )

    expire_saved_carts(now=FIXED_NOW, engine=engine)

    assert _item_count(engine, expired_id) == 0
    assert _item_count(engine, live_id) == 1
    assert _item_count(engine) == 1


def test_deletes_in_batches_of_500(engine):
    assert DELETE_BATCH_SIZE == 500
    for i in range(5):
        _insert_cart(
            engine,
            expires_at=FIXED_NOW - timedelta(minutes=i + 1),
            name=f"expired-{i}",
            items=[(f"sku-{i}", 1, 1.00)],
        )
    live_id = _insert_cart(engine, expires_at=FIXED_NOW + timedelta(days=2))

    deleted = expire_saved_carts(now=FIXED_NOW, engine=engine, batch_size=2)

    assert deleted == 5
    assert _cart_ids(engine) == {live_id}
    assert _item_count(engine) == 0


def test_noop_when_saved_carts_disabled(engine, monkeypatch):
    expired_id = _insert_cart(
        engine,
        expires_at=FIXED_NOW - timedelta(days=2),
        items=[("sku-keep", 3, 1.25)],
    )
    monkeypatch.setenv("SAVED_CARTS_ENABLED", "false")

    deleted = expire_saved_carts(now=FIXED_NOW, engine=engine)

    assert deleted == 0
    assert _cart_ids(engine) == {expired_id}
    assert _item_count(engine, expired_id) == 1


def test_main_logs_json_payload(engine, capsys, monkeypatch):
    _insert_cart(engine, expires_at=FIXED_NOW - timedelta(hours=3))
    _insert_cart(engine, expires_at=FIXED_NOW + timedelta(hours=3))

    original = expire_saved_carts
    monkeypatch.setattr(
        "jobs.expire_saved_carts.expire_saved_carts",
        lambda **kwargs: original(now=FIXED_NOW, engine=engine, **kwargs),
    )

    main()

    payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert payload == {"job": "expire-saved-carts", "deleted": 1}
    assert len(_cart_ids(engine)) == 1


def test_module_is_runnable_as_python_m(engine):
    _insert_cart(
        engine,
        expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
        items=[("old", 1, 1.00)],
    )
    backend_dir = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-m", "jobs.expire_saved_carts"],
        cwd=backend_dir,
        check=True,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert payload == {"job": "expire-saved-carts", "deleted": 1}
    assert _cart_ids(engine) == set()
    assert _item_count(engine) == 0
