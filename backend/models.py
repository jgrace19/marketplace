"""ORM models matching the R1 saved_carts / saved_cart_items schema."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class SavedCart(Base):
    __tablename__ = "saved_carts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    shopper_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    store_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    items: Mapped[List["SavedCartItem"]] = relationship(
        back_populates="cart",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SavedCartItem(Base):
    __tablename__ = "saved_cart_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1 AND quantity <= 99", name="ck_saved_cart_items_quantity"),
    )

    saved_cart_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("saved_carts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    product_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_at_save: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    cart: Mapped[SavedCart] = relationship(back_populates="items")
