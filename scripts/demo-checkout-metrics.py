#!/usr/bin/env python3
"""Place a fixed GreenMart basket and print checkout metrics.

The API must already be running and must not have STRIPE_SECRET_KEY set.
No secrets are required.

  python3 scripts/demo-checkout-metrics.py
  python3 scripts/demo-checkout-metrics.py --check baseline
  python3 scripts/demo-checkout-metrics.py --check healthy

``--check baseline`` is the buggy demo branch. ``--check healthy`` is the
same basket after line totals include pick quantity again.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

BASKET = (
    ("greenmart-grocery-1", 3),  # Organic Bananas (6 ct) @ 3.49
    ("greenmart-grocery-3", 2),  # 2% Milk - 1 Gallon @ 4.29
    ("greenmart-grocery-6", 1),  # Chicken Breast - 1.5 lb @ 11.79
    ("greenmart-grocery-7", 1),  # Baby Spinach - 10 oz @ 3.99
)
ORDER_COUNT = 4

# Recorded from a local run of this basket (4 orders) on the demo baseline.
EXPECTED = {
    "baseline": {
        "freshcart.checkout.orders": 4,
        "freshcart.checkout.units": 28,
        "freshcart.checkout.gmv_cents": 9424,
        "freshcart.checkout.average_order_value_cents": 2356,
    },
    "healthy": {
        "freshcart.checkout.orders": 4,
        "freshcart.checkout.units": 28,
        "freshcart.checkout.gmv_cents": 13932,
        "freshcart.checkout.average_order_value_cents": 3483,
    },
}


def _request(method: str, url: str, payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"{method} {url} failed: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"{method} {url} failed: {exc.reason}") from exc
    return json.loads(body)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="Backend origin")
    parser.add_argument("--check", choices=("baseline", "healthy"), help="Exit 1 unless metrics match")
    args = parser.parse_args()
    api = args.api.rstrip("/")

    catalog = _request("GET", f"{api}/api/products?store_id=greenmart&limit=60")
    by_id = {item["id"]: item for item in catalog["items"]}
    missing = [product_id for product_id, _qty in BASKET if product_id not in by_id]
    if missing:
        raise SystemExit(f"GreenMart catalog is missing {missing}")

    items = []
    for product_id, quantity in BASKET:
        product = by_id[product_id]
        items.append(
            {
                "id": product["id"],
                "name": product["name"],
                "price": product["price"],
                "quantity": quantity,
                "image_url": product.get("image_url") or "",
            }
        )

    order_payload = {"items": items, "store_id": "greenmart", "store_name": "GreenMart"}
    _request("POST", f"{api}/api/metrics/reset")

    print(f"Placing {ORDER_COUNT} identical GreenMart orders")
    for index in range(1, ORDER_COUNT + 1):
        order = _request("POST", f"{api}/api/orders", order_payload)
        print(
            f"  order {index}: subtotal_cents={order['subtotal_cents']} "
            f"units={order['units']} subtotal={order['subtotal']}"
        )

    snapshot = _request("GET", f"{api}/api/metrics")["metrics"]
    print(json.dumps(snapshot, indent=2, sort_keys=True))

    if args.check:
        expected = EXPECTED[args.check]
        mismatches = {
            key: {"expected": expected[key], "actual": snapshot.get(key)}
            for key in expected
            if snapshot.get(key) != expected[key]
        }
        if mismatches:
            print(f"check {args.check} failed:", json.dumps(mismatches, sort_keys=True), file=sys.stderr)
            return 1
        print(f"check {args.check} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
