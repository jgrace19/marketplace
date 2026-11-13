from __future__ import annotations

from datetime import datetime
import os
from typing import Iterator, List, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./freshcart.db")


def make_engine(url: str = DATABASE_URL) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, future=True)
    if url.startswith("sqlite"):
        # SQLite ignores ON DELETE CASCADE unless foreign keys are switched on per connection.
        @event.listens_for(engine, "connect")
        def _enable_sqlite_fks(dbapi_connection, _record) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


class Base(DeclarativeBase):
    pass


class SavedCart(Base):
    __tablename__ = "saved_carts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    shopper_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    store_id: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    items: Mapped[List["SavedCartItem"]] = relationship(
        back_populates="cart",
        cascade="all, delete-orphan",
        order_by="SavedCartItem.product_id",
    )


class SavedCartItem(Base):
    __tablename__ = "saved_cart_items"
    __table_args__ = (CheckConstraint("quantity >= 1 AND quantity <= 99", name="ck_saved_cart_items_quantity"),)

    saved_cart_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("saved_carts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    product_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_at_save: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), nullable=False)

    cart: Mapped[SavedCart] = relationship(back_populates="items")


def init_db(bind: Engine = engine) -> None:
    """Create tables directly. Production schema is owned by the R1 Alembic migration."""
    Base.metadata.create_all(bind)
