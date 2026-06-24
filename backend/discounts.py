"""Discount-code logic for guest checkout.

This module is intentionally free of any web-framework or Stripe dependencies so
that the discount-calculation rules can be unit-tested in isolation (boundary,
rounding, and negative cases). The FastAPI layer in ``main.py`` imports
``compute_discount`` and the ``DISCOUNT_CODES`` registry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, Optional, Set


PERCENT = "percent"
FIXED = "fixed"


@dataclass(frozen=True)
class DiscountCode:
    """A redeemable discount code and the rules that govern it."""

    code: str
    kind: str  # PERCENT or FIXED
    value: float  # percent (0-100) when PERCENT, dollars off when FIXED
    min_spend: float = 0.0
    # Inclusive last day the code is valid. ``None`` means it never expires.
    expires_on: Optional[date] = None
    single_use: bool = False
    active: bool = True


# Seed registry shared by the running app and the test suites. Codes are chosen
# to exercise every branch the acceptance criteria call out.
DISCOUNT_CODES: Dict[str, DiscountCode] = {
    "SAVE10": DiscountCode("SAVE10", PERCENT, 10.0),
    "5OFF": DiscountCode("5OFF", FIXED, 5.0, min_spend=20.0),
    "WELCOME100": DiscountCode("WELCOME100", PERCENT, 100.0),
    "BIGSPEND": DiscountCode("BIGSPEND", FIXED, 15.0, min_spend=100.0),
    "EXPIRED20": DiscountCode("EXPIRED20", PERCENT, 20.0, expires_on=date(2020, 1, 1)),
    "USEDONCE": DiscountCode("USEDONCE", FIXED, 8.0, single_use=True),
    "DISABLED": DiscountCode("DISABLED", PERCENT, 25.0, active=False),
}

# Single-use codes that have already been redeemed. In a real system this lives
# in a datastore; for the simulator it is an in-memory set seeded with one code
# so the "already used" path is demonstrable.
REDEEMED_CODES: Set[str] = {"USEDONCE"}


class DiscountError(Exception):
    """Raised when a code cannot be applied. The message is user-facing."""


@dataclass(frozen=True)
class DiscountResult:
    code: str
    discount_amount: float
    new_total: float
    details: Dict[str, object] = field(default_factory=dict)


def _to_cents(value: float) -> Decimal:
    """Round a dollar amount to cents using standard half-up currency rounding."""

    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_discount(
    subtotal: float,
    code: str,
    *,
    today: Optional[date] = None,
    redeemed_codes: Optional[Set[str]] = None,
) -> DiscountResult:
    """Validate ``code`` against ``subtotal`` and return the resulting amounts.

    Raises ``DiscountError`` with a user-facing message when the code cannot be
    applied. ``today`` and ``redeemed_codes`` are injectable so tests can pin the
    clock and the redemption state.
    """

    today = today or date.today()
    redeemed = REDEEMED_CODES if redeemed_codes is None else redeemed_codes

    if subtotal is None or subtotal <= 0:
        raise DiscountError("Add items to your cart before applying a code.")

    normalized = (code or "").strip().upper()
    if not normalized:
        raise DiscountError("Enter a discount code.")

    discount = DISCOUNT_CODES.get(normalized)
    if discount is None or not discount.active:
        raise DiscountError(f"'{normalized}' is not a valid discount code.")

    if discount.expires_on is not None and today > discount.expires_on:
        raise DiscountError(f"Code '{normalized}' has expired.")

    if discount.single_use and normalized in redeemed:
        raise DiscountError(f"Code '{normalized}' has already been used.")

    if subtotal < discount.min_spend:
        raise DiscountError(
            f"Code '{normalized}' requires a minimum spend of "
            f"${discount.min_spend:.2f}."
        )

    subtotal_cents = _to_cents(subtotal)
    if discount.kind == PERCENT:
        raw = subtotal_cents * (Decimal(str(discount.value)) / Decimal("100"))
        amount = raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    elif discount.kind == FIXED:
        amount = _to_cents(discount.value)
    else:  # pragma: no cover - guards against a malformed registry entry
        raise DiscountError(f"Code '{normalized}' is misconfigured.")

    # Never discount below zero; the order total floors at $0.00.
    amount = min(amount, subtotal_cents)
    new_total = subtotal_cents - amount

    return DiscountResult(
        code=normalized,
        discount_amount=float(amount),
        new_total=float(new_total),
        details={
            "kind": discount.kind,
            "value": discount.value,
            "min_spend": discount.min_spend,
        },
    )
