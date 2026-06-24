"""Unit tests for discount-code logic (ADO #1).

Parametrized over the test-data matrix: valid, invalid, boundary, and rounding
cases. Pure logic only — no server, no Stripe (see .cursor/rules/unit-pytest.mdc).
"""

from datetime import date

import pytest

from discounts import DiscountCode, DiscountError, compute_discount


@pytest.mark.parametrize(
    "subtotal, code, expected_amount, expected_total",
    [
        (100.00, "SAVE10", 10.00, 90.00),        # valid percentage
        (50.00, "5OFF", 5.00, 45.00),            # valid fixed, above min spend
        (20.00, "5OFF", 5.00, 15.00),            # fixed at exact min-spend boundary
        (100.00, "BIGSPEND", 15.00, 85.00),      # valid fixed, high min spend met
        (100.00, "WELCOME100", 100.00, 0.00),    # 100% off -> zero total
        (33.33, "SAVE10", 3.33, 30.00),          # rounding (3.333 -> 3.33)
        (0.10, "SAVE10", 0.01, 0.09),            # rounding on small amount
        (100.00, "  save10  ", 10.00, 90.00),    # case-insensitive + trimmed
    ],
)
def test_valid_codes_apply(subtotal, code, expected_amount, expected_total):
    result = compute_discount(subtotal, code)
    assert result.discount_amount == expected_amount
    assert result.new_total == expected_total


@pytest.mark.parametrize(
    "subtotal, code, message_contains",
    [
        (10.00, "5OFF", "minimum spend"),        # below min spend
        (50.00, "BIGSPEND", "minimum spend"),    # below higher min spend
        (100.00, "EXPIRED20", "expired"),        # expired code
        (100.00, "USEDONCE", "already been used"),  # single-use, already redeemed
        (100.00, "DISABLED", "not a valid"),     # inactive code
        (100.00, "NOPE", "not a valid"),         # unknown code
        (100.00, "", "Enter a discount code"),   # empty code
        (0.00, "SAVE10", "Add items"),           # zero-total cart
        (-5.00, "SAVE10", "Add items"),          # negative subtotal guard
    ],
)
def test_invalid_codes_are_rejected(subtotal, code, message_contains):
    with pytest.raises(DiscountError) as exc:
        compute_discount(subtotal, code)
    assert message_contains.lower() in str(exc.value).lower()


def test_fixed_discount_larger_than_cart_floors_at_zero(monkeypatch):
    # A fixed discount larger than the subtotal must not produce a negative total.
    import discounts

    monkeypatch.setitem(
        discounts.DISCOUNT_CODES, "MEGA", DiscountCode("MEGA", "fixed", 999.0)
    )
    result = compute_discount(5.00, "MEGA")
    assert result.discount_amount == 5.00
    assert result.new_total == 0.00


def test_full_percentage_floors_at_zero():
    result = compute_discount(49.99, "WELCOME100")
    assert result.discount_amount == 49.99
    assert result.new_total == 0.00


def test_expiry_is_inclusive_of_the_last_valid_day():
    # EXPIRED20 expires 2020-01-01: valid on that day, expired the next.
    ok = compute_discount(100.00, "EXPIRED20", today=date(2020, 1, 1))
    assert ok.new_total == 80.00

    with pytest.raises(DiscountError):
        compute_discount(100.00, "EXPIRED20", today=date(2020, 1, 2))


def test_single_use_code_valid_until_redeemed():
    # With an empty redemption set the single-use code applies.
    result = compute_discount(100.00, "USEDONCE", redeemed_codes=set())
    assert result.discount_amount == 8.00
