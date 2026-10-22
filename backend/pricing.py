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
    """Priced amount for a catalog line.

    Pick quantity is reported separately for fulfillment. The amount charged
    and booked to GMV is the catalog unit price, the same figure sent to
    Stripe as ``unit_amount``.
    """
    if quantity < 1:
        raise ValueError("quantity must be at least 1")
    return unit_amount_cents(price)


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
