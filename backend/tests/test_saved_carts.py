from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import db
import main
import saved_carts
from models import SavedCart, SavedCartItem
from stores import get_products_for_store


SHOPPER_A = {"X-Shopper-Id": "shopper-aaa"}
SHOPPER_B = {"X-Shopper-Id": "shopper-bbb"}


def _store_id() -> str:
    return "greenmart"


def _products() -> list[dict]:
    return get_products_for_store(_store_id(), limit=60)


def _payload(**overrides: object) -> dict:
    product = _products()[0]
    body = {
        "store_id": _store_id(),
        "items": [{"product_id": product["id"], "quantity": 2}],
    }
    body.update(overrides)
    return body


@pytest.fixture
def enabled_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("SAVED_CARTS_ENABLED", "1")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    db.reset_engine("sqlite:///:memory:")
    db.init_db()
    with TestClient(main.app) as test_client:
        yield test_client
    db.get_engine().dispose()


def _create(client: TestClient, headers: dict | None = None, **overrides: object) -> dict:
    response = client.post("/api/saved-carts", json=_payload(**overrides), headers=headers or SHOPPER_A)
    assert response.status_code == 201, response.text
    return response.json()


def test_routes_require_shopper_id(enabled_client):
    created = _create(enabled_client)
    cart_id = created["id"]

    assert enabled_client.post("/api/saved-carts", json=_payload()).status_code == 400
    assert enabled_client.get("/api/saved-carts").status_code == 400
    assert enabled_client.post(f"/api/saved-carts/{cart_id}/restore").status_code == 400
    assert enabled_client.delete(f"/api/saved-carts/{cart_id}").status_code == 400

    blank = {"X-Shopper-Id": "   "}
    assert enabled_client.get("/api/saved-carts", headers=blank).status_code == 400


def test_create_saved_cart_returns_201(enabled_client):
    product = _products()[0]
    body = enabled_client.post(
        "/api/saved-carts",
        json={
            "store_id": f"  {_store_id()}  ",
            "name": "  Weeknight staples  ",
            "items": [{"product_id": product["id"], "quantity": 3}],
        },
        headers=SHOPPER_A,
    ).json()

    created_at = datetime.fromisoformat(body["created_at"])
    expires_at = datetime.fromisoformat(body["expires_at"])
    assert body["store_id"] == _store_id()
    assert body["name"] == "Weeknight staples"
    assert body["item_count"] == 1
    assert body["subtotal"] == round(product["price"] * 3, 2)
    assert body["items"] == [
        {
            "product_id": product["id"],
            "quantity": 3,
            "unit_price_at_save": product["price"],
        }
    ]
    assert expires_at - created_at == timedelta(days=30)


def test_list_newest_first_with_current_subtotal(enabled_client):
    first_product, second_product = _products()[:2]
    older = _create(
        enabled_client,
        name="older",
        items=[{"product_id": first_product["id"], "quantity": 1}],
    )
    newer = _create(
        enabled_client,
        name="newer",
        items=[{"product_id": second_product["id"], "quantity": 2}],
    )

    session = db.get_session_factory()()
    cart = session.get(SavedCart, older["id"])
    assert cart is not None
    cart.created_at = cart.created_at - timedelta(hours=2)
    session.commit()
    session.close()

    response = enabled_client.get("/api/saved-carts", headers=SHOPPER_A)
    body = response.json()
    assert response.status_code == 200
    assert body["count"] == 2
    assert [item["id"] for item in body["items"]] == [newer["id"], older["id"]]
    assert body["items"][0]["item_count"] == 1
    assert body["items"][0]["subtotal"] == round(second_product["price"] * 2, 2)
    assert "expires_at" in body["items"][0]


def test_list_subtotal_uses_current_prices(enabled_client, monkeypatch: pytest.MonkeyPatch):
    product = _products()[0]
    _create(enabled_client, items=[{"product_id": product["id"], "quantity": 2}])

    inflated = [{**item, "price": 9.25} if item["id"] == product["id"] else item for item in _products()]
    monkeypatch.setattr(saved_carts, "get_products_for_store", lambda store_id, limit=200: inflated)

    body = enabled_client.get("/api/saved-carts", headers=SHOPPER_A).json()
    assert body["items"][0]["subtotal"] == 18.5


def test_restore_returns_current_prices_and_deletes(enabled_client, monkeypatch: pytest.MonkeyPatch):
    product = _products()[0]
    saved = _create(enabled_client, items=[{"product_id": product["id"], "quantity": 2}])

    inflated = [{**item, "price": 4.10} if item["id"] == product["id"] else item for item in _products()]
    monkeypatch.setattr(saved_carts, "get_products_for_store", lambda store_id, limit=200: inflated)

    response = enabled_client.post(f"/api/saved-carts/{saved['id']}/restore", headers=SHOPPER_A)
    body = response.json()
    assert response.status_code == 200
    assert body["store_id"] == _store_id()
    assert body["skipped"] == []
    assert body["items"][0]["product_id"] == product["id"]
    assert body["items"][0]["quantity"] == 2
    assert body["items"][0]["price"] == 4.1
    assert body["items"][0]["name"] == product["name"]

    listed = enabled_client.get("/api/saved-carts", headers=SHOPPER_A).json()
    assert listed["count"] == 0
    assert enabled_client.post(f"/api/saved-carts/{saved['id']}/restore", headers=SHOPPER_A).status_code == 404


def test_restore_skips_unavailable_products(enabled_client):
    first, second = _products()[:2]
    saved = _create(
        enabled_client,
        items=[
            {"product_id": first["id"], "quantity": 1},
            {"product_id": second["id"], "quantity": 4},
        ],
    )

    session = db.get_session_factory()()
    session.add(
        SavedCartItem(
            saved_cart_id=saved["id"],
            product_id="greenmart-discontinued-99",
            quantity=2,
            unit_price_at_save=1.99,
        )
    )
    session.commit()
    session.close()

    body = enabled_client.post(f"/api/saved-carts/{saved['id']}/restore", headers=SHOPPER_A).json()
    restored_ids = {item["product_id"] for item in body["items"]}
    assert restored_ids == {first["id"], second["id"]}
    assert body["skipped"] == [{"product_id": "greenmart-discontinued-99", "quantity": 2}]


def test_delete_returns_204(enabled_client):
    saved = _create(enabled_client)
    response = enabled_client.delete(f"/api/saved-carts/{saved['id']}", headers=SHOPPER_A)
    assert response.status_code == 204
    assert response.content == b""
    assert enabled_client.get("/api/saved-carts", headers=SHOPPER_A).json()["count"] == 0
    assert enabled_client.delete(f"/api/saved-carts/{saved['id']}", headers=SHOPPER_A).status_code == 404


def test_cross_shopper_isolation(enabled_client):
    saved = _create(enabled_client, name="A's cart")
    _create(enabled_client, headers=SHOPPER_B, name="B's cart")

    listed = enabled_client.get("/api/saved-carts", headers=SHOPPER_B).json()
    assert listed["count"] == 1
    assert listed["items"][0]["name"] == "B's cart"
    assert listed["items"][0]["id"] != saved["id"]

    assert enabled_client.post(f"/api/saved-carts/{saved['id']}/restore", headers=SHOPPER_B).status_code == 404
    assert enabled_client.delete(f"/api/saved-carts/{saved['id']}", headers=SHOPPER_B).status_code == 404

    still_there = enabled_client.get("/api/saved-carts", headers=SHOPPER_A).json()
    assert still_there["count"] == 1
    assert still_there["items"][0]["id"] == saved["id"]


def test_eleventh_save_conflicts(enabled_client):
    for index in range(10):
        _create(enabled_client, name=f"cart-{index}")

    response = enabled_client.post("/api/saved-carts", json=_payload(name="one-too-many"), headers=SHOPPER_A)
    assert response.status_code == 409
    assert "10" in response.json()["detail"]

    other = enabled_client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_B)
    assert other.status_code == 201


def test_unknown_store_and_product(enabled_client):
    unknown_store = enabled_client.post(
        "/api/saved-carts",
        json=_payload(store_id="missing-store"),
        headers=SHOPPER_A,
    )
    assert unknown_store.status_code == 404

    unknown_product = enabled_client.post(
        "/api/saved-carts",
        json=_payload(items=[{"product_id": "greenmart-does-not-exist", "quantity": 1}]),
        headers=SHOPPER_A,
    )
    assert unknown_product.status_code == 400
    assert "greenmart-does-not-exist" in unknown_product.json()["detail"]


def test_duplicate_product_id_is_rejected(enabled_client):
    product = _products()[0]
    response = enabled_client.post(
        "/api/saved-carts",
        json=_payload(
            items=[
                {"product_id": product["id"], "quantity": 1},
                {"product_id": product["id"], "quantity": 2},
            ]
        ),
        headers=SHOPPER_A,
    )
    assert response.status_code == 400


def test_disabled_flag_hides_routes(client):
    response = client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A)
    assert response.status_code == 404


def test_ttl_days_env(enabled_client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SAVED_CART_TTL_DAYS", "7")
    body = _create(enabled_client)
    created_at = datetime.fromisoformat(body["created_at"])
    expires_at = datetime.fromisoformat(body["expires_at"])
    assert expires_at - created_at == timedelta(days=7)
    assert created_at.tzinfo == timezone.utc or created_at.utcoffset() == timedelta(0)
