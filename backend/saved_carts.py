from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from db import SavedCart, SavedCartItem, get_session
from stores import get_products_for_store, get_store
from validation import require_store

MAX_SAVED_CARTS = 10
DEFAULT_TTL_DAYS = 30
SHOPPER_HEADER = "X-Shopper-Id"


def saved_carts_enabled() -> bool:
    return os.getenv("SAVED_CARTS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def ttl_days() -> int:
    raw = os.getenv("SAVED_CART_TTL_DAYS", "").strip()
    try:
        days = int(raw) if raw else DEFAULT_TTL_DAYS
    except ValueError:
        days = DEFAULT_TTL_DAYS
    return max(1, days)


def require_enabled() -> None:
    if not saved_carts_enabled():
        raise HTTPException(status_code=404, detail="Saved carts are not enabled.")


def require_shopper(x_shopper_id: str = Header(default="", alias=SHOPPER_HEADER)) -> str:
    cleaned = x_shopper_id.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{SHOPPER_HEADER} header is required.")
    if len(cleaned) > 120:
        raise HTTPException(status_code=400, detail=f"{SHOPPER_HEADER} must be 120 characters or fewer.")
    return cleaned


class SavedCartItemIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=1, le=99)


class SavedCartCreate(BaseModel):
    store_id: str
    items: List[SavedCartItemIn] = Field(min_length=1, max_length=200)
    name: Optional[str] = Field(default=None, max_length=120)


router = APIRouter(
    prefix="/api/saved-carts",
    tags=["saved-carts"],
    dependencies=[Depends(require_enabled)],
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(value: datetime) -> str:
    return value.replace(tzinfo=timezone.utc).isoformat()


def _catalog(store_id: str) -> Dict[str, dict]:
    return {product["id"]: product for product in get_products_for_store(store_id)}


def _serialize(cart: SavedCart, catalog: Dict[str, dict]) -> dict:
    items = []
    subtotal = 0.0
    for item in cart.items:
        product = catalog.get(item.product_id)
        current_price = float(product["price"]) if product else None
        if current_price is not None:
            subtotal += current_price * item.quantity
        items.append(
            {
                "product_id": item.product_id,
                "name": product["name"] if product else None,
                "image_url": product["image_url"] if product else None,
                "quantity": item.quantity,
                "unit_price_at_save": float(item.unit_price_at_save),
                "current_price": current_price,
                "available": product is not None,
            }
        )

    store = get_store(cart.store_id)
    return {
        "id": cart.id,
        "name": cart.name,
        "store_id": cart.store_id,
        "store_name": store.name if store else None,
        "item_count": sum(item.quantity for item in cart.items),
        "subtotal": round(subtotal, 2),
        "created_at": _iso(cart.created_at),
        "expires_at": _iso(cart.expires_at),
        "items": items,
    }


def _active_carts_query(shopper_id: str):
    return select(SavedCart).where(
        SavedCart.shopper_id == shopper_id,
        SavedCart.expires_at > _utcnow(),
    )


def _get_owned_cart(session: Session, shopper_id: str, cart_id: str) -> SavedCart:
    cart = session.scalars(
        _active_carts_query(shopper_id).where(SavedCart.id == cart_id).options(selectinload(SavedCart.items))
    ).first()
    if cart is None:
        raise HTTPException(status_code=404, detail=f"Saved cart '{cart_id}' not found.")
    return cart


@router.post("", status_code=status.HTTP_201_CREATED)
def create_saved_cart(
    payload: SavedCartCreate,
    shopper_id: str = Depends(require_shopper),
    session: Session = Depends(get_session),
) -> dict:
    store_id = require_store(payload.store_id)
    catalog = _catalog(store_id)

    seen = set()
    duplicates = []
    unknown = []
    for item in payload.items:
        if item.product_id in seen:
            duplicates.append(item.product_id)
        seen.add(item.product_id)
        if item.product_id not in catalog:
            unknown.append(item.product_id)
    if duplicates:
        raise HTTPException(status_code=400, detail=f"Duplicate product_id(s): {', '.join(sorted(set(duplicates)))}.")
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown product_id(s) for store '{store_id}': {', '.join(unknown)}.",
        )

    active_count = session.scalar(
        select(func.count()).select_from(_active_carts_query(shopper_id).subquery())
    )
    if active_count >= MAX_SAVED_CARTS:
        raise HTTPException(
            status_code=409,
            detail=f"Saved cart limit of {MAX_SAVED_CARTS} reached. Delete a saved cart to save another.",
        )

    now = _utcnow()
    name = (payload.name or "").strip() or None
    cart = SavedCart(
        id=str(uuid4()),
        shopper_id=shopper_id,
        store_id=store_id,
        name=name,
        created_at=now,
        expires_at=now + timedelta(days=ttl_days()),
        items=[
            SavedCartItem(
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price_at_save=catalog[item.product_id]["price"],
            )
            for item in payload.items
        ],
    )
    session.add(cart)
    session.commit()
    return _serialize(cart, catalog)


@router.get("")
def list_saved_carts(
    shopper_id: str = Depends(require_shopper),
    session: Session = Depends(get_session),
) -> dict:
    carts = session.scalars(
        _active_carts_query(shopper_id)
        .options(selectinload(SavedCart.items))
        .order_by(SavedCart.created_at.desc(), SavedCart.id.desc())
    ).all()
    catalogs: Dict[str, Dict[str, dict]] = {}
    items = []
    for cart in carts:
        if cart.store_id not in catalogs:
            catalogs[cart.store_id] = _catalog(cart.store_id)
        items.append(_serialize(cart, catalogs[cart.store_id]))
    return {"items": items, "count": len(items), "limit": MAX_SAVED_CARTS}


@router.post("/{cart_id}/restore")
def restore_saved_cart(
    cart_id: str,
    shopper_id: str = Depends(require_shopper),
    session: Session = Depends(get_session),
) -> dict:
    cart = _get_owned_cart(session, shopper_id, cart_id)
    catalog = _catalog(cart.store_id)

    restored = []
    skipped = []
    for item in cart.items:
        product = catalog.get(item.product_id)
        if product is None:
            skipped.append({"product_id": item.product_id, "quantity": item.quantity, "reason": "unavailable"})
            continue
        restored.append({**product, "quantity": item.quantity})

    store_id = cart.store_id
    session.delete(cart)
    session.commit()
    return {"store_id": store_id, "items": restored, "skipped": skipped}


@router.delete("/{cart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_cart(
    cart_id: str,
    shopper_id: str = Depends(require_shopper),
    session: Session = Depends(get_session),
) -> Response:
    cart = _get_owned_cart(session, shopper_id, cart_id)
    session.delete(cart)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
