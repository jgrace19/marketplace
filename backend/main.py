from __future__ import annotations

from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_HALF_UP
import os
from typing import List, Optional
import re

import stripe
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from stores import (
    get_products_for_store,
    get_store,
    get_stores_for_zip,
)


load_dotenv()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:8080,http://127.0.0.1:8080,"
    "http://localhost:8081,http://127.0.0.1:8081"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]


@dataclass
class Product:
    id: str
    name: str
    description: str
    price: float
    image_url: str
    source: str
    store_id: str = ""


@dataclass(frozen=True)
class PromoDefinition:
    discount_type: str
    value: int
    minimum_subtotal_cents: int = 0
    expired: bool = False


PROMO_CODES = {
    "FRESH10": PromoDefinition(discount_type="percent", value=10),
    "SAVE5": PromoDefinition(
        discount_type="fixed",
        value=500,
        minimum_subtotal_cents=2500,
    ),
    "FRESH20EXPIRED": PromoDefinition(
        discount_type="percent",
        value=20,
        expired=True,
    ),
}


def _product_from_dict(item: dict) -> Product:
    return Product(
        id=item["id"],
        name=item["name"],
        description=item["description"],
        price=float(item["price"]),
        image_url=item["image_url"],
        source=item.get("source", "grocery-fallback"),
        store_id=item.get("store_id", ""),
    )


def get_store_products(store_id: str, limit: int = 24) -> List[Product]:
    return [_product_from_dict(item) for item in get_products_for_store(store_id, limit=limit)]


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _matches_partial_terms(product: Product, query: str) -> bool:
    query_terms = _tokenize(query)
    if not query_terms:
        return True

    product_terms = _tokenize(f"{product.name} {product.description}")
    if not product_terms:
        return False

    # Every query term must be a direct substring of at least one product term.
    return all(any(term in token for token in product_terms) for term in query_terms)


def _require_store(store_id: str) -> str:
    cleaned = (store_id or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="store_id is required.")
    if get_store(cleaned) is None:
        raise HTTPException(status_code=404, detail=f"Unknown store_id '{cleaned}'.")
    return cleaned


def _money_to_cents(value: float) -> int:
    return int(
        (Decimal(str(value)) * Decimal("100")).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )


def _promo_error(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={"code": code, "message": message},
    )


def validate_promo_code(code: str, subtotal_cents: int) -> dict:
    normalized_code = (code or "").strip().upper()
    promo = PROMO_CODES.get(normalized_code)
    if promo is None:
        raise _promo_error("invalid_promo_code", "That promo code is not valid.")
    if promo.expired:
        raise _promo_error("expired_promo_code", "That promo code has expired.")
    if subtotal_cents < promo.minimum_subtotal_cents:
        minimum = promo.minimum_subtotal_cents / 100
        raise _promo_error(
            "minimum_subtotal_not_met",
            f"{normalized_code} requires a subtotal of at least ${minimum:.2f}.",
        )

    if promo.discount_type == "percent":
        discount_cents = int(
            (Decimal(subtotal_cents) * Decimal(promo.value) / Decimal("100")).quantize(
                Decimal("1"),
                rounding=ROUND_HALF_UP,
            )
        )
        description = f"{promo.value}% off"
    else:
        discount_cents = promo.value
        description = f"${promo.value / 100:.2f} off"

    discount_cents = min(discount_cents, subtotal_cents)
    return {
        "code": normalized_code,
        "description": description,
        "discount_type": promo.discount_type,
        "discount_value": promo.value,
        "minimum_subtotal": promo.minimum_subtotal_cents / 100,
        "subtotal": subtotal_cents / 100,
        "discount_amount": discount_cents / 100,
        "total": (subtotal_cents - discount_cents) / 100,
    }


class CheckoutItem(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0)
    quantity: int = Field(ge=1, le=99)
    image_url: str = ""


class CheckoutRequest(BaseModel):
    items: List[CheckoutItem] = Field(min_length=1, max_length=50)
    store_id: Optional[str] = None
    store_name: Optional[str] = None
    promo_code: Optional[str] = Field(default=None, max_length=40)


def configure_stripe() -> None:
    secret_key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not secret_key:
        raise HTTPException(
            status_code=500,
            detail="Missing STRIPE_SECRET_KEY in environment.",
        )
    stripe.api_key = secret_key


app = FastAPI(title="Ecommerce Simulator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/stores")
def list_stores(zip: str = Query(default="", min_length=0)) -> dict:
    resolved_zip, items = get_stores_for_zip(zip)
    return {"items": items, "zip": resolved_zip, "count": len(items)}


@app.get("/api/products")
def list_products(
    store_id: str = Query(default=""),
    query: str = Query(default="", min_length=0),
    limit: int = Query(default=24, ge=1, le=60),
) -> dict:
    resolved_store = _require_store(store_id)
    products = get_store_products(resolved_store, limit=limit)
    if query.strip():
        products = [p for p in products if _matches_partial_terms(p, query)]
    return {"items": [asdict(p) for p in products], "count": len(products), "store_id": resolved_store}


@app.get("/api/recommendations")
def get_recommendations(store_id: str = Query(default="")) -> dict:
    """Return today's personalized deals for a store (lowest-priced items)."""
    resolved_store = _require_store(store_id)
    products = get_store_products(resolved_store, limit=60)
    discounted = [p for p in products if p.price < 4.00]
    if not discounted:
        discounted = sorted(products, key=lambda p: p.price)[:5]
    average_deal_price = (
        round(sum(p.price for p in discounted) / len(discounted), 2) if discounted else 0.0
    )
    return {
        "average_deal_price": average_deal_price,
        "items": [asdict(p) for p in discounted],
        "store_id": resolved_store,
    }


@app.get("/api/promo/validate")
def validate_promo(
    code: str = Query(min_length=1, max_length=40),
    subtotal: float = Query(default=0, ge=0),
) -> dict:
    return validate_promo_code(code, _money_to_cents(subtotal))


def _stripe_product_data(item: CheckoutItem) -> dict:
    product_data = {"name": item.name}
    if item.image_url:
        product_data["images"] = [item.image_url]
    return product_data


def _resolve_checkout_items(payload: CheckoutRequest) -> List[CheckoutItem]:
    if not payload.store_id:
        if payload.promo_code:
            raise HTTPException(
                status_code=400,
                detail="store_id is required when applying a promo code.",
            )
        return payload.items

    resolved_store = _require_store(payload.store_id)
    catalog = {
        product["id"]: product
        for product in get_products_for_store(resolved_store, limit=60)
    }
    resolved_items = []
    for requested_item in payload.items:
        product = catalog.get(requested_item.id)
        if product is None:
            raise HTTPException(
                status_code=400,
                detail=f"Product '{requested_item.id}' is not available at this store.",
            )
        resolved_items.append(
            CheckoutItem(
                id=product["id"],
                name=product["name"],
                price=product["price"],
                quantity=requested_item.quantity,
                image_url=product.get("image_url", ""),
            )
        )
    return resolved_items


def _build_discounted_line_items(
    items: List[CheckoutItem],
    unit_amounts: List[int],
    target_total_cents: int,
) -> list:
    line_totals = [
        unit_amount * item.quantity
        for item, unit_amount in zip(items, unit_amounts)
    ]
    subtotal_cents = sum(line_totals)
    allocations = [
        (target_total_cents * line_total) // subtotal_cents
        for line_total in line_totals
    ]
    remainder_order = sorted(
        range(len(items)),
        key=lambda index: (target_total_cents * line_totals[index]) % subtotal_cents,
        reverse=True,
    )
    for index in remainder_order[: target_total_cents - sum(allocations)]:
        allocations[index] += 1

    line_items = []
    for item, allocated_total in zip(items, allocations):
        lower_unit_amount, higher_unit_count = divmod(
            allocated_total,
            item.quantity,
        )
        lower_unit_count = item.quantity - higher_unit_count
        product_data = _stripe_product_data(item)
        if higher_unit_count:
            line_items.append(
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": product_data,
                        "unit_amount": lower_unit_amount + 1,
                    },
                    "quantity": higher_unit_count,
                }
            )
        if lower_unit_count:
            line_items.append(
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": product_data,
                        "unit_amount": lower_unit_amount,
                    },
                    "quantity": lower_unit_count,
                }
            )
    return line_items


@app.post("/api/checkout/session")
def create_checkout_session(payload: CheckoutRequest) -> dict:
    items = _resolve_checkout_items(payload)
    unit_amounts = []
    for item in items:
        unit_amount = _money_to_cents(item.price)
        if unit_amount <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid price for item '{item.name}'.",
            )
        unit_amounts.append(unit_amount)

    subtotal_cents = sum(
        unit_amount * item.quantity
        for item, unit_amount in zip(items, unit_amounts)
    )
    promo = None
    if payload.promo_code:
        promo = validate_promo_code(payload.promo_code, subtotal_cents)
        line_items = _build_discounted_line_items(
            items,
            unit_amounts,
            _money_to_cents(promo["total"]),
        )
    else:
        line_items = [
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": _stripe_product_data(item),
                    "unit_amount": unit_amount,
                },
                "quantity": item.quantity,
            }
            for item, unit_amount in zip(items, unit_amounts)
        ]

    configure_stripe()

    session_kwargs = {
        "mode": "payment",
        "line_items": line_items,
        "success_url": f"{FRONTEND_URL}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{FRONTEND_URL}/?checkout=cancel",
    }
    metadata = {}
    if payload.store_id:
        metadata["store_id"] = payload.store_id
    if payload.store_name:
        metadata["store_name"] = payload.store_name
    if promo:
        metadata["promo_code"] = promo["code"]
        metadata["discount_amount"] = f"{promo['discount_amount']:.2f}"
    if metadata:
        session_kwargs["metadata"] = metadata

    try:
        session = stripe.checkout.Session.create(**session_kwargs)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to create Stripe checkout session: {exc}",
        ) from exc

    return {"checkout_url": session.url, "session_id": session.id}


@app.get("/api/checkout/session-status")
def get_checkout_session_status(session_id: str = Query(min_length=10)) -> dict:
    configure_stripe()
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Unable to retrieve Stripe checkout session: {exc}",
        ) from exc

    metadata = session.metadata or {}
    return {
        "session_id": session.id,
        "status": session.status,
        "payment_status": session.payment_status,
        "customer_email": session.customer_details.email if session.customer_details else None,
        "amount_total": session.amount_total,
        "currency": session.currency,
        "store_id": metadata.get("store_id") or "",
        "store_name": metadata.get("store_name") or "",
    }
