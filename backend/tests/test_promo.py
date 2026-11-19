from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import main
from stores import STORES


def _sample_item(**overrides: object) -> dict:
    item = {
        "id": "sku-1",
        "name": "Sample Item",
        "price": 3.49,
        "quantity": 2,
    }
    item.update(overrides)
    return item


@pytest.mark.parametrize(
    ("subtotal_cents", "expected_discount"),
    [
        (698, 70),
        (1005, 101),
        (1015, 102),
    ],
)
def test_compute_promo_fresh10_rounds_half_up(subtotal_cents, expected_discount):
    result = main.compute_promo("FRESH10", subtotal_cents)
    assert result["discount_cents"] == expected_discount
    assert result["total_cents"] == subtotal_cents - expected_discount


def test_compute_promo_fresh10_case_insensitive_and_trimmed():
    result = main.compute_promo("  fresh10  ", 1000)
    assert result["code"] == "FRESH10"
    assert result["discount_cents"] == 100


def test_compute_promo_save5_min_subtotal():
    with pytest.raises(HTTPException) as exc:
        main.compute_promo("SAVE5", 2499)
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "min_subtotal"

    result = main.compute_promo("SAVE5", 2500)
    assert result["discount_cents"] == 500


def test_compute_promo_expired_and_unknown():
    with pytest.raises(HTTPException) as exc:
        main.compute_promo("SPRING24", 3000)
    assert exc.value.detail["code"] == "expired"

    with pytest.raises(HTTPException) as exc:
        main.compute_promo("NOTREAL", 3000)
    assert exc.value.detail["code"] == "unknown"


def test_compute_promo_discount_capped_at_subtotal(monkeypatch):
    monkeypatch.setitem(main.PROMO_CODES["SAVE5"], "min_subtotal_cents", 0)
    result = main.compute_promo("SAVE5", 400)
    assert result["discount_cents"] == 400
    assert result["total_cents"] == 0


def test_validate_promo_success(client):
    response = client.get("/api/promo/validate", params={"code": "FRESH10", "subtotal": 6.98})
    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "FRESH10"
    assert body["total"] == round(body["subtotal"] - body["discount"], 2)


@pytest.mark.parametrize(
    ("code", "subtotal", "error_code"),
    [
        ("SPRING24", 30.0, "expired"),
        ("BADCODE", 30.0, "unknown"),
        ("SAVE5", 24.99, "min_subtotal"),
    ],
)
def test_validate_promo_errors(client, code, subtotal, error_code):
    response = client.get("/api/promo/validate", params={"code": code, "subtotal": subtotal})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == error_code


def test_validate_promo_missing_code(client):
    response = client.get("/api/promo/validate", params={"subtotal": 10})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "unknown"


def test_validate_promo_negative_subtotal(client):
    response = client.get("/api/promo/validate", params={"code": "FRESH10", "subtotal": -1})
    assert response.status_code == 422


def test_checkout_skips_coupon_when_discount_is_zero(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {
        "items": [_sample_item(price=0.01, quantity=1)],
        "promo_code": "FRESH10",
    }
    fake_session = SimpleNamespace(url="https://checkout.example.test/s", id="cs_test_zero")

    with patch.object(main.stripe.Coupon, "create") as create_coupon:
        with patch.object(main.stripe.checkout.Session, "create", return_value=fake_session) as create_session:
            response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 200
    create_coupon.assert_not_called()
    session_kwargs = create_session.call_args.kwargs
    assert "discounts" not in session_kwargs
    assert session_kwargs["metadata"]["promo_code"] == "FRESH10"


def test_checkout_applies_stripe_coupon(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    store_id = next(iter(STORES))
    store_name = STORES[store_id].name
    payload = {
        "items": [_sample_item(price=3.49, quantity=2)],
        "store_id": store_id,
        "store_name": store_name,
        "promo_code": "FRESH10",
    }
    fake_coupon = SimpleNamespace(id="coupon_test_1")
    fake_session = SimpleNamespace(url="https://checkout.example.test/s", id="cs_test_promo")

    with patch.object(main.stripe.Coupon, "create", return_value=fake_coupon) as create_coupon:
        with patch.object(main.stripe.checkout.Session, "create", return_value=fake_session) as create_session:
            response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 200
    create_coupon.assert_called_once()
    coupon_kwargs = create_coupon.call_args.kwargs
    assert coupon_kwargs["amount_off"] == 70
    assert coupon_kwargs["currency"] == "usd"
    assert coupon_kwargs["duration"] == "once"
    assert coupon_kwargs["name"] == "FRESH10"

    session_kwargs = create_session.call_args.kwargs
    assert session_kwargs["discounts"] == [{"coupon": fake_coupon.id}]
    assert session_kwargs["metadata"]["promo_code"] == "FRESH10"
    assert session_kwargs["line_items"][0]["price_data"]["unit_amount"] == 349


def test_checkout_rejects_invalid_promo_without_stripe(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {"items": [_sample_item()], "promo_code": "SPRING24"}

    with patch.object(main.stripe.Coupon, "create") as create_coupon:
        with patch.object(main.stripe.checkout.Session, "create") as create_session:
            response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "expired"
    create_coupon.assert_not_called()
    create_session.assert_not_called()


def test_checkout_without_promo_unchanged(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    fake = SimpleNamespace(url="https://checkout.example.test/s", id="cs_test_123456")

    with patch.object(main.stripe.Coupon, "create") as create_coupon:
        with patch.object(main.stripe.checkout.Session, "create", return_value=fake) as create:
            response = client.post("/api/checkout/session", json={"items": [_sample_item()]})

    assert response.status_code == 200
    create_coupon.assert_not_called()
    assert "discounts" not in create.call_args.kwargs


def test_checkout_coupon_create_failure_is_bad_gateway(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {"items": [_sample_item()], "promo_code": "FRESH10"}

    with patch.object(main.stripe.Coupon, "create", side_effect=RuntimeError("coupon down")):
        with patch.object(main.stripe.checkout.Session, "create") as create_session:
            response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 502
    assert "coupon down" in response.json()["detail"]
    create_session.assert_not_called()


def test_session_status_includes_promo_code(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    fake = SimpleNamespace(
        id="cs_test_123456",
        status="complete",
        payment_status="paid",
        customer_details=SimpleNamespace(email="buyer@example.com"),
        amount_total=628,
        currency="usd",
        metadata={"store_id": "store-a", "store_name": "Store A", "promo_code": "FRESH10"},
    )

    with patch.object(main.stripe.checkout.Session, "retrieve", return_value=fake):
        response = client.get(
            "/api/checkout/session-status",
            params={"session_id": "cs_test_123456"},
        )

    assert response.status_code == 200
    assert response.json()["promo_code"] == "FRESH10"