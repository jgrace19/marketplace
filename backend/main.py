from __future__ import annotations

from dataclasses import dataclass, asdict
import os
from typing import List
import re

import requests
import stripe
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


AMAZON_URL = "https://www.amazon.com/"
DUMMY_PRODUCTS_URL = "https://dummyjson.com/products?limit=24"
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
GROCERY_FALLBACK_PRODUCTS = [
    {
        "id": "grocery-1",
        "name": "Organic Bananas (6 ct)",
        "description": "Fresh organic bananas, perfect for smoothies and snacks.",
        "price": 3.49,
        "image_url": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-2",
        "name": "Avocados (4 ct)",
        "description": "Ripe Hass avocados selected for same-day delivery.",
        "price": 5.99,
        "image_url": "https://images.unsplash.com/photo-1519162808019-7de1683fa2ad?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-3",
        "name": "2% Milk - 1 Gallon",
        "description": "Cold and fresh local dairy milk.",
        "price": 4.29,
        "image_url": "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-4",
        "name": "Large Brown Eggs (12 ct)",
        "description": "Farm fresh eggs for breakfast and baking.",
        "price": 4.99,
        "image_url": "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-5",
        "name": "Sourdough Bread Loaf",
        "description": "Artisan sourdough baked this morning.",
        "price": 5.49,
        "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-6",
        "name": "Chicken Breast - 1.5 lb",
        "description": "Boneless skinless chicken breast, lean protein.",
        "price": 11.79,
        "image_url": "https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-7",
        "name": "Baby Spinach - 10 oz",
        "description": "Triple-washed baby spinach for salads and saute.",
        "price": 3.99,
        "image_url": "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-8",
        "name": "Honeycrisp Apples (3 lb bag)",
        "description": "Crisp, sweet apples sourced from US farms.",
        "price": 6.99,
        "image_url": "https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-9",
        "name": "Greek Yogurt - Plain 32 oz",
        "description": "Creamy high-protein yogurt with no added sugar.",
        "price": 5.89,
        "image_url": "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-10",
        "name": "Strawberries - 1 lb",
        "description": "Sweet strawberries packed and ready to serve.",
        "price": 4.79,
        "image_url": "https://images.unsplash.com/photo-1518635017498-87f514b751ba?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-11",
        "name": "Blueberries - 6 oz",
        "description": "Fresh blueberries great for breakfast and snacks.",
        "price": 3.99,
        "image_url": "https://images.unsplash.com/photo-1498550744921-75f79806b8a7?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-12",
        "name": "Raspberries - 6 oz",
        "description": "Juicy raspberries with bright flavor.",
        "price": 4.59,
        "image_url": "https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-13",
        "name": "Broccoli Crowns - 1 bunch",
        "description": "Green broccoli crowns for roasting or steaming.",
        "price": 2.89,
        "image_url": "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-14",
        "name": "Carrots - 2 lb bag",
        "description": "Crunchy whole carrots, peeled or whole-cook friendly.",
        "price": 2.49,
        "image_url": "https://images.unsplash.com/photo-1447175008436-170170753d52?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-15",
        "name": "Red Bell Peppers (3 ct)",
        "description": "Sweet bell peppers for stir-fry and salads.",
        "price": 4.49,
        "image_url": "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-16",
        "name": "Roma Tomatoes - 1 lb",
        "description": "Firm Roma tomatoes for sauces and sandwiches.",
        "price": 2.99,
        "image_url": "https://images.unsplash.com/photo-1546470427-e26264be0b0d?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-17",
        "name": "Yellow Onions - 3 lb bag",
        "description": "Kitchen staple onions with mild sweet flavor.",
        "price": 3.29,
        "image_url": "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-18",
        "name": "Russet Potatoes - 5 lb bag",
        "description": "Versatile russet potatoes for baking and mashing.",
        "price": 5.29,
        "image_url": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-19",
        "name": "Cucumber - each",
        "description": "Cool crisp cucumbers for salads and snacks.",
        "price": 1.19,
        "image_url": "https://images.unsplash.com/photo-1604977046807-2975f6f63853?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-20",
        "name": "Navel Oranges - 3 lb bag",
        "description": "Sweet seedless oranges rich in vitamin C.",
        "price": 5.49,
        "image_url": "https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-21",
        "name": "Shredded Cheddar - 8 oz",
        "description": "Sharp shredded cheddar for tacos and casseroles.",
        "price": 3.79,
        "image_url": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-22",
        "name": "Salted Butter - 1 lb",
        "description": "Creamy salted butter, four quarter sticks.",
        "price": 4.69,
        "image_url": "https://images.unsplash.com/photo-1589985270958-3492ab8d1f6f?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-23",
        "name": "Orange Juice - 52 oz",
        "description": "No-pulp orange juice made from concentrate.",
        "price": 4.39,
        "image_url": "https://images.unsplash.com/photo-1603569283847-aa295f0d016a?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-24",
        "name": "Sparkling Water Variety - 12 pack",
        "description": "Refreshing flavored sparkling water assortment.",
        "price": 6.99,
        "image_url": "https://images.unsplash.com/photo-1622484212850-8c3f56f7e3d9?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-25",
        "name": "Ground Coffee Medium Roast - 12 oz",
        "description": "Balanced medium roast with cocoa notes.",
        "price": 9.99,
        "image_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-26",
        "name": "Long Grain White Rice - 2 lb",
        "description": "Pantry staple rice, fluffy and versatile.",
        "price": 3.49,
        "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-27",
        "name": "Penne Pasta - 16 oz",
        "description": "Durum wheat semolina pasta for weeknight meals.",
        "price": 1.89,
        "image_url": "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-28",
        "name": "Marinara Sauce - 24 oz",
        "description": "Tomato basil marinara with olive oil.",
        "price": 3.99,
        "image_url": "https://images.unsplash.com/photo-1607301405390-bf44f99b61cc?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-29",
        "name": "Whole Wheat Bread",
        "description": "Soft sliced whole wheat sandwich bread.",
        "price": 3.29,
        "image_url": "https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-30",
        "name": "Rolled Oats - 18 oz",
        "description": "Old-fashioned oats for oatmeal and baking.",
        "price": 4.19,
        "image_url": "https://images.unsplash.com/photo-1571680322279-a226e6a4cc2a?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-31",
        "name": "Peanut Butter Creamy - 16 oz",
        "description": "Creamy roasted peanut butter.",
        "price": 3.59,
        "image_url": "https://images.unsplash.com/photo-1612300345113-f0c33d9f6f26?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": "grocery-32",
        "name": "Mixed Greens Salad Kit - 9 oz",
        "description": "Ready-to-eat mixed greens with crunchy toppings.",
        "price": 4.99,
        "image_url": "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
    },
]

load_dotenv()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@dataclass
class Product:
    id: str
    name: str
    description: str
    price: float
    image_url: str
    source: str


def _safe_price(value: str) -> float:
    cleaned = "".join(ch for ch in value if ch.isdigit() or ch == ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def fetch_amazon_products(limit: int = 24) -> List[Product]:
    """
    Best-effort scrape of discoverable products from the Amazon home page.
    Amazon frequently changes markup and may block automated traffic.
    """
    response = requests.get(AMAZON_URL, headers=REQUEST_HEADERS, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    products: List[Product] = []

    # Heuristic extraction from image cards and links.
    for img in soup.select("img"):
        alt = (img.get("alt") or "").strip()
        src = (img.get("src") or "").strip()
        if not alt or not src:
            continue
        if len(alt) < 6:
            continue
        if "amazon" in alt.lower() or "logo" in alt.lower():
            continue

        parent_link = img.find_parent("a")
        title = alt[:120]
        description = "Featured on Amazon home page"
        price = 0.0

        if parent_link:
            # Try to infer nearby pricing text.
            nearby_text = parent_link.get_text(" ", strip=True)
            if "$" in nearby_text:
                candidate = nearby_text[nearby_text.find("$") : nearby_text.find("$") + 12]
                price = _safe_price(candidate)

        product = Product(
            id=f"amazon-{len(products) + 1}",
            name=title,
            description=description,
            price=price,
            image_url=src,
            source="amazon",
        )
        products.append(product)

        if len(products) >= limit:
            break

    # Deduplicate by name + image
    unique: List[Product] = []
    seen = set()
    for p in products:
        key = (p.name.lower(), p.image_url)
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)
    return unique[:limit]


def fetch_dummy_products(limit: int = 24) -> List[Product]:
    response = requests.get(DUMMY_PRODUCTS_URL, timeout=10)
    response.raise_for_status()
    data = response.json()
    products = []

    for item in data.get("products", [])[:limit]:
        products.append(
            Product(
                id=f"dummy-{item['id']}",
                name=item["title"],
                description=item["description"],
                price=float(item["price"]),
                image_url=item.get("thumbnail", ""),
                source="dummyjson",
            )
        )
    return products


def fetch_grocery_fallback_products(limit: int = 24) -> List[Product]:
    products = []
    for item in GROCERY_FALLBACK_PRODUCTS[:limit]:
        products.append(
            Product(
                id=item["id"],
                name=item["name"],
                description=item["description"],
                price=float(item["price"]),
                image_url=item["image_url"],
                source="grocery-fallback",
            )
        )
    return products


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


def get_products(limit: int = 24) -> List[Product]:
    try:
        amazon_products = fetch_amazon_products(limit=limit)
        if amazon_products:
            return amazon_products
    except Exception:
        # Fallback when Amazon blocks scraping or markup changes.
        pass
    return fetch_grocery_fallback_products(limit=limit)


class CheckoutItem(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0)
    quantity: int = Field(ge=1, le=99)
    image_url: str = ""


class CheckoutRequest(BaseModel):
    items: List[CheckoutItem] = Field(min_length=1)


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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/products")
def list_products(query: str = Query(default="", min_length=0), limit: int = Query(default=24, ge=1, le=60)) -> dict:
    products = get_products(limit=limit)
    if query.strip():
        products = [p for p in products if _matches_partial_terms(p, query)]
    return {"items": [asdict(p) for p in products], "count": len(products)}


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
                "quantity": 1,
            }
        )

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            success_url=f"{FRONTEND_URL}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/?checkout=cancel",
        )
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

    return {
        "session_id": session.id,
        "status": session.status,
        "payment_status": session.payment_status,
        "customer_email": session.customer_details.email if session.customer_details else None,
        "amount_total": session.amount_total,
        "currency": session.currency,
    }
