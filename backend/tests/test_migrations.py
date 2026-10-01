from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_TABLES = {"saved_carts", "saved_cart_items"}


def _alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _engine(url: str):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)
    if url.startswith("sqlite"):
        with engine.connect() as connection:
            connection.execute(text("PRAGMA foreign_keys=ON"))
            connection.commit()
    return engine


def _table_names(url: str) -> set[str]:
    engine = _engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def _assert_schema(url: str) -> None:
    engine = _engine(url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert APP_TABLES <= tables

        cart_columns = {column["name"] for column in inspector.get_columns("saved_carts")}
        assert cart_columns == {"id", "shopper_id", "store_id", "name", "created_at", "expires_at"}

        item_columns = {column["name"] for column in inspector.get_columns("saved_cart_items")}
        assert item_columns == {
            "id",
            "saved_cart_id",
            "product_id",
            "quantity",
            "unit_price_at_save",
        }

        indexed_columns = {
            tuple(index["column_names"]) for index in inspector.get_indexes("saved_carts")
        }
        assert ("shopper_id",) in indexed_columns
        assert ("expires_at",) in indexed_columns

        unique_constraints = inspector.get_unique_constraints("saved_cart_items")
        assert any(
            set(constraint["column_names"]) == {"saved_cart_id", "product_id"}
            for constraint in unique_constraints
        )

        foreign_keys = inspector.get_foreign_keys("saved_cart_items")
        assert any(
            fk["referred_table"] == "saved_carts"
            and set(fk["constrained_columns"]) == {"saved_cart_id"}
            and str(fk.get("options", {}).get("ondelete") or fk.get("ondelete") or "").upper()
            == "CASCADE"
            for fk in foreign_keys
        )

        check_constraints = inspector.get_check_constraints("saved_cart_items")
        assert any("quantity" in (constraint.get("sqltext") or "") for constraint in check_constraints)
    finally:
        engine.dispose()


def _insert_cart(connection, cart_id: str) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    connection.execute(
        text(
            """
            INSERT INTO saved_carts (id, shopper_id, store_id, name, expires_at)
            VALUES (:id, :shopper_id, :store_id, :name, :expires_at)
            """
        ),
        {
            "id": cart_id,
            "shopper_id": "shopper-1",
            "store_id": "store-1",
            "name": "Weekly staples",
            "expires_at": expires_at,
        },
    )


def _insert_item(connection, cart_id: str, product_id: str, quantity: int) -> None:
    connection.execute(
        text(
            """
            INSERT INTO saved_cart_items
                (id, saved_cart_id, product_id, quantity, unit_price_at_save)
            VALUES (:id, :saved_cart_id, :product_id, :quantity, :unit_price_at_save)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "saved_cart_id": cart_id,
            "product_id": product_id,
            "quantity": quantity,
            "unit_price_at_save": "3.49",
        },
    )


def _assert_constraints(url: str) -> None:
    engine = _engine(url)
    cart_id = str(uuid.uuid4())
    try:
        with engine.begin() as connection:
            _insert_cart(connection, cart_id)
            _insert_item(connection, cart_id, "sku-1", 2)

        with pytest.raises(IntegrityError):
            with engine.begin() as connection:
                _insert_item(connection, cart_id, "sku-1", 3)

        with pytest.raises(IntegrityError):
            with engine.begin() as connection:
                _insert_item(connection, cart_id, "sku-bad-low", 0)

        with pytest.raises(IntegrityError):
            with engine.begin() as connection:
                _insert_item(connection, cart_id, "sku-bad-high", 100)

        with engine.begin() as connection:
            connection.execute(text("DELETE FROM saved_carts WHERE id = :id"), {"id": cart_id})
            remaining = connection.execute(text("SELECT COUNT(*) FROM saved_cart_items")).scalar_one()
            assert remaining == 0
    finally:
        engine.dispose()


def _assert_upgrade_downgrade_upgrade(url: str) -> None:
    cfg = _alembic_config(url)
    command.upgrade(cfg, "head")
    _assert_schema(url)
    _assert_constraints(url)

    command.downgrade(cfg, "base")
    leftover = _table_names(url) & APP_TABLES
    assert leftover == set()

    command.upgrade(cfg, "head")
    _assert_schema(url)


def test_upgrade_downgrade_upgrade_sqlite(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    url = f"sqlite:///{tmp_path / 'freshcart.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    _assert_upgrade_downgrade_upgrade(url)


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL is not set")
def test_upgrade_downgrade_upgrade_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", url)
    _assert_upgrade_downgrade_upgrade(url)
