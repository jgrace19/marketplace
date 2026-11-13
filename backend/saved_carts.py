"""Saved-cart API (FE-6). Shopper-scoped routes behind SAVED_CARTS_ENABLED."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from db import get_db, init_db
from models import SavedCart, SavedCartItem
from stores import get_products_for_store


MAX_SAVED_CARTS_PER_SHOPPER = 10
DEFAULT_TTL_DAYS = 30
_TRUE_VALUES = {"1", "true", "yes", "on"}


def _saved_carts_enabled() -> bool:
    return os.getenv("SAVED_CARTS_ENABLED", "").strip().lower() in _TRUE_VALUES


def _ttl_days() -> int:
    raw = os.getenv("SAVED_CART_TTL_DAYS", str(DEFAULT_TTL_DAYS)).strip()
    try:
        days = int(raw)
    except ValueError:
        days = DEFAULT_TTL_DAYS
    return days if days > 0 else DEFAULT_TTL_DAYS


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _require_enabled() -> None:
    if not _saved_carts_enabled():
        raise HTTPException(status_code=404, detail="Saved carts are disabled.")
    init_db()


def require_shopper_id(x_shopper_id: Optional[str] = Header(default=None)) -> str:
    shopper_id = (x_shopper_id or "").strip()
    if not shopper_id:
        raise HTTPException(status_code=400, detail="X-Shopper-Id is required.")
    return shopper_id


def _require_store(store_id: str) -> str:
    from main import _require_store as require_store

    return require_store(store_id)


def _catalog_by_id(store_id: str) -> Dict[str, dict]:
    return {item["id"]: item for item in get_products_for_store(store_id, limit=200)}


def _money(value: object) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01")))


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _current_subtotal(store_id: str, items: List[SavedCartItem]) -> float:
    catalog = _catalog_by_id(store_id)
    total = Decimal("0.00")
    for item in items:
        product = catalog.get(item.product_id)
        if product is None:
            continue
        total += Decimal(str(product["price"])) * item.quantity
    return _money(total)


def _cart_summary(cart: SavedCart) -> dict:
    return {
        "id": cart.id,
        "store_id": cart.store_id,
        "name": cart.name,
        "created_at": _iso(cart.created_at),
        "expires_at": _iso(cart.expires_at),
        "item_count": len(cart.items),
        "subtotal": _current_subtotal(cart.store_id, cart.items),
    }


def _get_owned_cart(db: Session, shopper_id: str, cart_id: str) -> SavedCart:
    cart = db.scalars(
        select(SavedCart)
        .options(selectinload(SavedCart.items))
        .where(SavedCart.id == cart_id)
    ).first()
    if cart is None or cart.shopper_id != shopper_id:
        raise HTTPException(status_code=404, detail="Saved cart not found.")
    return cart


class SavedCartItemIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=1, le=99)


class SavedCartCreate(BaseModel):
    store_id: str = Field(min_length=1)
    items: List[SavedCartItemIn] = Field(min_length=1)
    name: Optional[str] = Field(default=None, max_length=200)


router = APIRouter(
    prefix="/api/saved-carts",
    tags=["saved-carts"],
    dependencies=[Depends(_require_enabled)],
)


@router.post("", status_code=201)
def create_saved_cart(
    payload: SavedCartCreate,
    shopper_id: str = Depends(require_shopper_id),
    db: Session = Depends(get_db),
) -> dict:
    store_id = _require_store(payload.store_id)
    catalog = _catalog_by_id(store_id)

    seen: set[str] = set()
    resolved: List[tuple[str, int, float]] = []
    for item in payload.items:
        if item.product_id in seen:
            raise HTTPException(status_code=400, detail="Duplicate product_id in items.")
        seen.add(item.product_id)
        product = catalog.get(item.product_id)
        if product is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown product_id '{item.product_id}' for store '{store_id}'.",
            )
        resolved.append((item.product_id, item.quantity, _money(product["price"])))

    count = db.scalar(
        select(func.count()).select_from(SavedCart).where(SavedCart.shopper_id == shopper_id)
    ) or 0
    if count >= MAX_SAVED_CARTS_PER_SHOPPER:
        raise HTTPException(status_code=409, detail="Maximum of 10 saved carts reached.")

    now = _now()
    name = (payload.name or "").strip() or None
    cart = SavedCart(
        shopper_id=shopper_id,
        store_id=store_id,
        name=name,
        created_at=now,
        expires_at=now + timedelta(days=_ttl_days()),
        items=[
            SavedCartItem(
                product_id=product_id,
                quantity=quantity,
                unit_price_at_save=price,
            )
            for product_id, quantity, price in resolved
        ],
    )
    db.add(cart)
    db.flush()
    db.refresh(cart)

    summary = _cart_summary(cart)
    summary["items"] = [
        {
            "product_id": item.product_id,
            "quantity": item.quantity,
            "unit_price_at_save": _money(item.unit_price_at_save),
        }
        for item in cart.items
    ]
    return summary


@router.get("")
def list_saved_carts(
    shopper_id: str = Depends(require_shopper_id),
    db: Session = Depends(get_db),
) -> dict:
    carts = db.scalars(
        select(SavedCart)
        .options(selectinload(SavedCart.items))
        .where(SavedCart.shopper_id == shopper_id)
        .order_by(SavedCart.created_at.desc(), SavedCart.id.desc())
    ).all()
    return {"items": [_cart_summary(cart) for cart in carts], "count": len(carts)}


@router.post("/{cart_id}/restore")
def restore_saved_cart(
    cart_id: str,
    shopper_id: str = Depends(require_shopper_id),
    db: Session = Depends(get_db),
) -> dict:
    cart = _get_owned_cart(db, shopper_id, cart_id)
    catalog = _catalog_by_id(cart.store_id)

    items: List[dict] = []
    skipped: List[dict] = []
    for line in cart.items:
        product = catalog.get(line.product_id)
        if product is None:
            skipped.append({"product_id": line.product_id, "quantity": line.quantity})
            continue
        items.append(
            {
                "product_id": product["id"],
                "quantity": line.quantity,
                "price": _money(product["price"]),
                "name": product["name"],
                "image_url": product.get("image_url", ""),
                "description": product.get("description", ""),
            }
        )

    db.delete(cart)
    db.flush()
    return {"store_id": cart.store_id, "items": items, "skipped": skipped}


@router.delete("/{cart_id}", status_code=204)
def delete_saved_cart(
    cart_id: str,
    shopper_id: str = Depends(require_shopper_id),
    db: Session = Depends(get_db),
) -> None:
    cart = _get_owned_cart(db, shopper_id, cart_id)
    db.delete(cart)
    db.flush()
