from __future__ import annotations

from dataclasses import dataclass, asdict
import ipaddress
import os
import re
import socket
import time
from typing import List, Optional
from urllib.parse import urlsplit

import requests
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
REQUEST_HEADERS = {"User-Agent": "FreshCart-PriceCheck/1.0"}
PRICE_CHECK_CONNECT_TIMEOUT_SECONDS = 3
PRICE_CHECK_READ_TIMEOUT_SECONDS = 5
PRICE_CHECK_TOTAL_TIMEOUT_SECONDS = 10
PRICE_CHECK_MAX_CONTENT_BYTES = 1_000_000


@dataclass
class Product:
    id: str
    name: str
    description: str
    price: float
    image_url: str
    source: str
    store_id: str = ""


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


def _validate_price_check_url(url: str) -> str:
    cleaned = (url or "").strip()
    if not cleaned or any(character.isspace() for character in cleaned):
        raise HTTPException(status_code=400, detail="A valid http(s) URL is required.")

    try:
        parsed = urlsplit(cleaned)
        port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="A valid http(s) URL is required.") from exc

    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise HTTPException(status_code=400, detail="A valid http(s) URL is required.")

    hostname = parsed.hostname.lower().rstrip(".")
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="A public http(s) URL is required.")

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address is not None and (not address.is_global or address.is_multicast):
        raise HTTPException(status_code=400, detail="A public http(s) URL is required.")
    if address is None:
        labels = hostname.split(".")
        if len(labels) < 2 or any(
            not re.fullmatch(r"(?!-)[a-z0-9-]{1,63}(?<!-)", label) for label in labels
        ):
            raise HTTPException(status_code=400, detail="A valid http(s) URL is required.")

    return cleaned


def _require_public_destination(url: str) -> None:
    parsed = urlsplit(url)
    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    try:
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach the comparison URL.",
        ) from exc

    if not addresses:
        raise HTTPException(status_code=502, detail="Unable to reach the comparison URL.")

    for *_, socket_address in addresses:
        address = ipaddress.ip_address(socket_address[0].split("%", 1)[0])
        if not address.is_global or address.is_multicast:
            raise HTTPException(status_code=400, detail="A public http(s) URL is required.")


class CheckoutItem(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0)
    quantity: int = Field(ge=1, le=99)
    image_url: str = ""


class CheckoutRequest(BaseModel):
    items: List[CheckoutItem] = Field(min_length=1)
    store_id: Optional[str] = None
    store_name: Optional[str] = None


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


@app.get("/api/price-check")
def price_check(url: str = Query(default="")) -> dict:
    validated_url = _validate_price_check_url(url)
    _require_public_destination(validated_url)
    deadline = time.monotonic() + PRICE_CHECK_TOTAL_TIMEOUT_SECONDS
    response = None
    try:
        response = requests.get(
            validated_url,
            headers=REQUEST_HEADERS,
            timeout=(
                PRICE_CHECK_CONNECT_TIMEOUT_SECONDS,
                PRICE_CHECK_READ_TIMEOUT_SECONDS,
            ),
            allow_redirects=False,
            stream=True,
        )
        content_length = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if time.monotonic() > deadline:
                raise requests.Timeout("Price check exceeded its total timeout.")
            content_length += len(chunk)
            if content_length > PRICE_CHECK_MAX_CONTENT_BYTES:
                raise requests.RequestException("Price check response was too large.")
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach the comparison URL.",
        ) from exc
    finally:
        if response is not None:
            response.close()

    return {
        "status_code": response.status_code,
        "content_length": content_length,
    }


@app.post("/api/checkout/session")
def create_checkout_session(payload: CheckoutRequest) -> dict:
    configure_stripe()
    line_items = []

    for item in payload.items:
        unit_amount = int(round(item.price * 100))
        if unit_amount <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid price for item '{item.name}'.",
            )

        product_data = {"name": item.name}
        if item.image_url:
            product_data["images"] = [item.image_url]

        line_items.append(
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": product_data,
                    "unit_amount": unit_amount,
                },
                "quantity": item.quantity,
            }
        )

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
