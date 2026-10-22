"""In-process checkout counters.

Values reset when the API process restarts. Names are the contract the
anomaly demo scrapes from ``GET /api/metrics``.
"""

from __future__ import annotations

ORDERS = "freshcart.checkout.orders"
UNITS = "freshcart.checkout.units"
GMV_CENTS = "freshcart.checkout.gmv_cents"
AOV_CENTS = "freshcart.checkout.average_order_value_cents"

_orders = 0
_units = 0
_gmv_cents = 0


def reset() -> None:
    global _orders, _units, _gmv_cents
    _orders = 0
    _units = 0
    _gmv_cents = 0


def record_checkout(units: int, subtotal_cents: int) -> None:
    global _orders, _units, _gmv_cents
    _orders += 1
    _units += int(units)
    _gmv_cents += int(subtotal_cents)


def snapshot() -> dict:
    average = int(round(_gmv_cents / _orders)) if _orders else 0
    return {
        ORDERS: _orders,
        UNITS: _units,
        GMV_CENTS: _gmv_cents,
        AOV_CENTS: average,
    }
