from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal
from sqlite3 import Connection as SQLiteConnection
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    create_engine,
    event,
    func,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DEFAULT_DATABASE_URL = "sqlite:///./freshcart.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    if not isinstance(dbapi_connection, SQLiteConnection):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    pass


class SavedCart(Base):
    __tablename__ = "saved_carts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    shopper_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    store_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    items: Mapped[list[SavedCartItem]] = relationship(
        back_populates="saved_cart", cascade="all, delete-orphan"
    )


class SavedCartItem(Base):
    __tablename__ = "saved_cart_items"
    __table_args__ = (
        UniqueConstraint("saved_cart_id", "product_id", name="uq_saved_cart_items_cart_product"),
        CheckConstraint("quantity >= 1 AND quantity <= 99", name="ck_saved_cart_items_quantity"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    saved_cart_id: Mapped[UUID] = mapped_column(
        ForeignKey("saved_carts.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_at_save: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    saved_cart: Mapped[SavedCart] = relationship(back_populates="items")
