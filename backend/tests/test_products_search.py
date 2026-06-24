"""Unit tests for the pure product-search helpers in main.py.

These run without network access or a live server and exist so the repo has a
green Pytest baseline that follows .cursor/rules/unit-pytest.mdc. Feature-specific
discount tests live alongside these once authored.
"""

import pytest

from main import Product, _matches_partial_terms, _safe_price


def _product(name: str, description: str = "") -> Product:
    return Product(
        id="x",
        name=name,
        description=description,
        price=1.0,
        image_url="",
        source="test",
    )


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("$3.49", 3.49),
        ("USD 12.00", 12.0),
        ("1,299.99", 1299.99),
        ("free", 0.0),
        ("", 0.0),
    ],
)
def test_safe_price_parses_currency_text(raw, expected):
    assert _safe_price(raw) == expected


@pytest.mark.parametrize(
    "query, name, description, expected",
    [
        ("milk", "2% Milk - 1 Gallon", "dairy", True),
        ("organic banana", "Organic Bananas (6 ct)", "fresh", True),
        ("milk eggs", "2% Milk - 1 Gallon", "dairy", False),
        ("", "anything", "", True),
        ("xyzzy", "Sourdough Bread Loaf", "artisan", False),
    ],
)
def test_matches_partial_terms(query, name, description, expected):
    assert _matches_partial_terms(_product(name, description), query) is expected
