"""Shared cart and checkout totals.

Quotes, mock checkout, and booked GMV all go through this module so the
storefront and the metrics snapshot price an order the same way.
"""

from __future__ import annotations


def unit_amount_cents(price: float) -> int:
    cents = int(round(float(price) * 100))
    if cents <= 0:
        raise ValueError("price must be at least one cent")
    return cents


def line_subtotal_cents(price: float, quantity: int) -> int:
    """Extended line amount in cents (unit price × pick quantity).

    Must match what Stripe charges for the line (``unit_amount`` × ``quantity``).
    """
    if quantity < 1:
        raise ValueError("quantity must be at least 1")
    return unit_amount_cents(price) * quantity


def order_totals(items: list) -> dict:
    units = 0
    subtotal_cents = 0
    for item in items:
        units += int(item.quantity)
        subtotal_cents += line_subtotal_cents(item.price, item.quantity)
    return {
        "units": units,
        "subtotal_cents": subtotal_cents,
        "subtotal": subtotal_cents / 100,
    }
