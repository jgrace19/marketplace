"""Static multi-store marketplace registry and store-scoped grocery catalogs."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional


DEFAULT_ZIP = "10002"
SUPPORTED_ZIPS = ("10002", "94107", "60614")


@dataclass
class Store:
    id: str
    name: str
    slug: str
    logo_url: str
    tags: List[str] = field(default_factory=list)
    eta_label: str = ""
    distance_mi: float = 0.0
    supports_pickup: bool = False
    supports_ebt: bool = False


STORES: Dict[str, Store] = {
    "greenmart": Store(
        id="greenmart",
        name="GreenMart",
        slug="greenmart",
        logo_url="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "offers", "ebt", "pickup"],
        eta_label="By 7:00pm",
        distance_mi=1.2,
        supports_pickup=True,
        supports_ebt=True,
    ),
    "costclub": Store(
        id="costclub",
        name="CostClub",
        slug="costclub",
        logo_url="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "low-prices", "pickup"],
        eta_label="By 8:30pm",
        distance_mi=3.4,
        supports_pickup=True,
        supports_ebt=False,
    ),
    "targetrun": Store(
        id="targetrun",
        name="TargetRun",
        slug="targetrun",
        logo_url="https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "offers", "pickup", "fastest"],
        eta_label="By 6:15pm",
        distance_mi=0.8,
        supports_pickup=True,
        supports_ebt=True,
    ),
    "quickstop": Store(
        id="quickstop",
        name="QuickStop",
        slug="quickstop",
        logo_url="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "fastest"],
        eta_label="By 5:45pm",
        distance_mi=0.4,
        supports_pickup=False,
        supports_ebt=False,
    ),
    "citypharmacy": Store(
        id="citypharmacy",
        name="CityPharmacy",
        slug="citypharmacy",
        logo_url="https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=200&q=80",
        tags=["offers", "pickup"],
        eta_label="By 7:30pm",
        distance_mi=1.1,
        supports_pickup=True,
        supports_ebt=False,
    ),
    "freshfare": Store(
        id="freshfare",
        name="FreshFare",
        slug="freshfare",
        logo_url="https://images.unsplash.com/photo-1534723452862-4c874033d4d4?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "offers", "ebt", "pickup", "fastest"],
        eta_label="By 6:45pm",
        distance_mi=1.6,
        supports_pickup=True,
        supports_ebt=True,
    ),
    "megavalue": Store(
        id="megavalue",
        name="MegaValue",
        slug="megavalue",
        logo_url="https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "low-prices", "ebt"],
        eta_label="By 9:00pm",
        distance_mi=4.2,
        supports_pickup=False,
        supports_ebt=True,
    ),
    "cornermarket": Store(
        id="cornermarket",
        name="CornerMarket",
        slug="cornermarket",
        logo_url="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=200&q=80",
        tags=["grocery", "fastest", "pickup"],
        eta_label="By 6:00pm",
        distance_mi=0.6,
        supports_pickup=True,
        supports_ebt=False,
    ),
}

# Zip -> ordered store ids with optional eta/distance overrides for demo theater.
ZIP_STORE_OVERRIDES: Dict[str, Dict[str, dict]] = {
    "10002": {
        "greenmart": {},
        "targetrun": {},
        "quickstop": {},
        "freshfare": {},
        "citypharmacy": {},
        "cornermarket": {},
        "costclub": {},
        "megavalue": {},
    },
    "94107": {
        "freshfare": {"eta_label": "By 5:30pm", "distance_mi": 0.7},
        "targetrun": {"eta_label": "By 6:00pm", "distance_mi": 1.1},
        "greenmart": {"eta_label": "By 7:15pm", "distance_mi": 1.9},
        "costclub": {"eta_label": "By 8:00pm", "distance_mi": 2.8},
        "quickstop": {"eta_label": "By 5:50pm", "distance_mi": 0.5},
        "megavalue": {"eta_label": "By 8:45pm", "distance_mi": 3.6},
        "citypharmacy": {"eta_label": "By 7:00pm", "distance_mi": 1.4},
    },
    "60614": {
        "cornermarket": {"eta_label": "By 5:40pm", "distance_mi": 0.3},
        "megavalue": {"eta_label": "By 7:45pm", "distance_mi": 2.1},
        "greenmart": {"eta_label": "By 6:50pm", "distance_mi": 1.0},
        "costclub": {"eta_label": "By 8:15pm", "distance_mi": 3.9},
        "citypharmacy": {"eta_label": "By 6:30pm", "distance_mi": 0.9},
        "targetrun": {"eta_label": "By 7:10pm", "distance_mi": 1.7},
        "quickstop": {"eta_label": "By 6:05pm", "distance_mi": 0.8},
    },
}

# Base grocery SKUs (shared fields). Assigned per-store below.
_BASE_GROCERY = [
    {
        "base_id": "grocery-1",
        "name": "Organic Bananas (6 ct)",
        "description": "Fresh organic bananas, perfect for smoothies and snacks.",
        "price": 3.49,
        "image_url": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-2",
        "name": "Avocados (4 ct)",
        "description": "Ripe Hass avocados selected for same-day delivery.",
        "price": 5.99,
        "image_url": "https://images.unsplash.com/photo-1519162808019-7de1683fa2ad?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-3",
        "name": "2% Milk - 1 Gallon",
        "description": "Cold and fresh local dairy milk.",
        "price": 4.29,
        "image_url": "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-4",
        "name": "Large Brown Eggs (12 ct)",
        "description": "Farm fresh eggs for breakfast and baking.",
        "price": 4.99,
        "image_url": "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-5",
        "name": "Sourdough Bread Loaf",
        "description": "Artisan sourdough baked this morning.",
        "price": 5.49,
        "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-6",
        "name": "Chicken Breast - 1.5 lb",
        "description": "Boneless skinless chicken breast, lean protein.",
        "price": 11.79,
        "image_url": "https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-7",
        "name": "Baby Spinach - 10 oz",
        "description": "Triple-washed baby spinach for salads and saute.",
        "price": 3.99,
        "image_url": "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-8",
        "name": "Honeycrisp Apples (3 lb bag)",
        "description": "Crisp, sweet apples sourced from US farms.",
        "price": 6.99,
        "image_url": "https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-9",
        "name": "Greek Yogurt - Plain 32 oz",
        "description": "Creamy high-protein yogurt with no added sugar.",
        "price": 5.89,
        "image_url": "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-10",
        "name": "Strawberries - 1 lb",
        "description": "Sweet strawberries packed and ready to serve.",
        "price": 4.79,
        "image_url": "https://images.unsplash.com/photo-1518635017498-87f514b751ba?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-11",
        "name": "Blueberries - 6 oz",
        "description": "Fresh blueberries great for breakfast and snacks.",
        "price": 3.99,
        "image_url": "https://images.unsplash.com/photo-1498550744921-75f79806b8a7?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-12",
        "name": "Raspberries - 6 oz",
        "description": "Juicy raspberries with bright flavor.",
        "price": 4.59,
        "image_url": "https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-13",
        "name": "Broccoli Crowns - 1 bunch",
        "description": "Green broccoli crowns for roasting or steaming.",
        "price": 2.89,
        "image_url": "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-14",
        "name": "Carrots - 2 lb bag",
        "description": "Crunchy whole carrots, peeled or whole-cook friendly.",
        "price": 2.49,
        "image_url": "https://images.unsplash.com/photo-1447175008436-170170753d52?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-15",
        "name": "Red Bell Peppers (3 ct)",
        "description": "Sweet bell peppers for stir-fry and salads.",
        "price": 4.49,
        "image_url": "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-16",
        "name": "Roma Tomatoes - 1 lb",
        "description": "Firm Roma tomatoes for sauces and sandwiches.",
        "price": 2.99,
        "image_url": "https://images.unsplash.com/photo-1546470427-e26264be0b0d?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-17",
        "name": "Yellow Onions - 3 lb bag",
        "description": "Kitchen staple onions with mild sweet flavor.",
        "price": 3.29,
        "image_url": "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-18",
        "name": "Russet Potatoes - 5 lb bag",
        "description": "Versatile russet potatoes for baking and mashing.",
        "price": 5.29,
        "image_url": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-19",
        "name": "Cucumber - each",
        "description": "Cool crisp cucumbers for salads and snacks.",
        "price": 1.19,
        "image_url": "https://images.unsplash.com/photo-1604977046807-2975f6f63853?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-20",
        "name": "Navel Oranges - 3 lb bag",
        "description": "Sweet seedless oranges rich in vitamin C.",
        "price": 5.49,
        "image_url": "https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-21",
        "name": "Shredded Cheddar - 8 oz",
        "description": "Sharp shredded cheddar for tacos and casseroles.",
        "price": 3.79,
        "image_url": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-22",
        "name": "Salted Butter - 1 lb",
        "description": "Creamy salted butter, four quarter sticks.",
        "price": 4.69,
        "image_url": "https://images.unsplash.com/photo-1589985270958-3492ab8d1f6f?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-23",
        "name": "Orange Juice - 52 oz",
        "description": "No-pulp orange juice made from concentrate.",
        "price": 4.39,
        "image_url": "https://images.unsplash.com/photo-1603569283847-aa295f0d016a?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-24",
        "name": "Sparkling Water Variety - 12 pack",
        "description": "Refreshing flavored sparkling water assortment.",
        "price": 6.99,
        "image_url": "https://images.unsplash.com/photo-1622484212850-8c3f56f7e3d9?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-25",
        "name": "Ground Coffee Medium Roast - 12 oz",
        "description": "Balanced medium roast with cocoa notes.",
        "price": 9.99,
        "image_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-26",
        "name": "Long Grain White Rice - 2 lb",
        "description": "Pantry staple rice, fluffy and versatile.",
        "price": 3.49,
        "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-27",
        "name": "Penne Pasta - 16 oz",
        "description": "Durum wheat semolina pasta for weeknight meals.",
        "price": 1.89,
        "image_url": "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-28",
        "name": "Marinara Sauce - 24 oz",
        "description": "Tomato basil marinara with olive oil.",
        "price": 3.99,
        "image_url": "https://images.unsplash.com/photo-1607301405390-bf44f99b61cc?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-29",
        "name": "Whole Wheat Bread",
        "description": "Soft sliced whole wheat sandwich bread.",
        "price": 3.29,
        "image_url": "https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-30",
        "name": "Rolled Oats - 18 oz",
        "description": "Old-fashioned oats for oatmeal and baking.",
        "price": 4.19,
        "image_url": "https://images.unsplash.com/photo-1571680322279-a226e6a4cc2a?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-31",
        "name": "Peanut Butter Creamy - 16 oz",
        "description": "Creamy roasted peanut butter.",
        "price": 3.59,
        "image_url": "https://images.unsplash.com/photo-1612300345113-f0c33d9f6f26?auto=format&fit=crop&w=800&q=80",
    },
    {
        "base_id": "grocery-32",
        "name": "Mixed Greens Salad Kit - 9 oz",
        "description": "Ready-to-eat mixed greens with crunchy toppings.",
        "price": 4.99,
        "image_url": "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
    },
]

# Primary store ownership: partition base SKUs across stores.
_STORE_CATALOG_SLICES: Dict[str, List[int]] = {
    "greenmart": list(range(0, 8)),
    "costclub": list(range(8, 14)),
    "targetrun": list(range(14, 20)),
    "quickstop": list(range(20, 24)),
    "citypharmacy": list(range(24, 28)),
    "freshfare": list(range(28, 32)) + list(range(0, 4)),
    "megavalue": list(range(4, 12)),
    "cornermarket": list(range(12, 20)),
}

# Cross-store duplicates with different prices (multi-retailer story).
_CROSS_STORE_DUPLICATES = [
    ("costclub", 0, 2.99),  # bananas cheaper at CostClub
    ("megavalue", 0, 2.79),
    ("targetrun", 2, 3.99),  # milk
    ("greenmart", 8, 5.49),  # yogurt (from costclub slice base index 8)
    ("quickstop", 3, 5.49),  # eggs
]


def _make_product(store_id: str, base: dict, price: Optional[float] = None) -> dict:
    return {
        "id": f"{store_id}-{base['base_id']}",
        "name": base["name"],
        "description": base["description"],
        "price": float(price if price is not None else base["price"]),
        "image_url": base["image_url"],
        "source": "grocery-fallback",
        "store_id": store_id,
    }


def _build_store_products() -> List[dict]:
    products: List[dict] = []
    seen_ids = set()

    for store_id, indices in _STORE_CATALOG_SLICES.items():
        for idx in indices:
            item = _make_product(store_id, _BASE_GROCERY[idx])
            if item["id"] in seen_ids:
                continue
            seen_ids.add(item["id"])
            products.append(item)

    for store_id, base_idx, price in _CROSS_STORE_DUPLICATES:
        item = _make_product(store_id, _BASE_GROCERY[base_idx], price=price)
        if item["id"] in seen_ids:
            # Already owned by that store from primary slice; skip duplicate id.
            continue
        seen_ids.add(item["id"])
        products.append(item)

    return products


STORE_PRODUCTS: List[dict] = _build_store_products()


def normalize_zip(zip_code: Optional[str]) -> str:
    cleaned = (zip_code or "").strip()
    if cleaned in ZIP_STORE_OVERRIDES:
        return cleaned
    return DEFAULT_ZIP


def get_stores_for_zip(zip_code: Optional[str] = None) -> tuple[str, List[dict]]:
    resolved = normalize_zip(zip_code)
    overrides = ZIP_STORE_OVERRIDES[resolved]
    items: List[dict] = []
    for store_id, patch in overrides.items():
        store = STORES.get(store_id)
        if not store:
            continue
        payload = asdict(deepcopy(store))
        payload.update(patch)
        items.append(payload)
    return resolved, items


def get_store(store_id: str) -> Optional[Store]:
    return STORES.get(store_id)


def get_products_for_store(store_id: str, limit: int = 60) -> List[dict]:
    return [p for p in STORE_PRODUCTS if p["store_id"] == store_id][:limit]
