from datetime import timedelta

import pytest
from sqlalchemy.orm import sessionmaker

import db
import main
import saved_carts
from stores import STORES, get_products_for_store

SHOPPER_A = {"X-Shopper-Id": "shopper-a"}
SHOPPER_B = {"X-Shopper-Id": "shopper-b"}


def _store_id(index: int = 0) -> str:
    return list(STORES)[index]


def _catalog(store_id: str) -> list:
    return get_products_for_store(store_id)


def _payload(store_id: str | None = None, count: int = 2, **overrides: object) -> dict:
    store_id = store_id or _store_id()
    products = _catalog(store_id)[:count]
    payload = {
        "store_id": store_id,
        "items": [{"product_id": p["id"], "quantity": index + 1} for index, p in enumerate(products)],
    }
    payload.update(overrides)
    return payload


@pytest.fixture(autouse=True)
def saved_carts_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SAVED_CARTS_ENABLED", "true")
    monkeypatch.delenv("SAVED_CART_TTL_DAYS", raising=False)

    engine = db.make_engine(f"sqlite:///{tmp_path / 'saved-carts.db'}")
    db.init_db(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _override_session():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    main.app.dependency_overrides[db.get_session] = _override_session
    yield factory
    main.app.dependency_overrides.pop(db.get_session, None)
    engine.dispose()


def test_routes_are_hidden_when_flag_is_off(client, monkeypatch):
    monkeypatch.delenv("SAVED_CARTS_ENABLED", raising=False)

    for response in (
        client.get("/api/saved-carts", headers=SHOPPER_A),
        client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A),
        client.post("/api/saved-carts/any/restore", headers=SHOPPER_A),
        client.delete("/api/saved-carts/any", headers=SHOPPER_A),
    ):
        assert response.status_code == 404
        assert "not enabled" in response.json()["detail"]


@pytest.mark.parametrize("headers", [{}, {"X-Shopper-Id": ""}, {"X-Shopper-Id": "   "}])
def test_every_route_requires_shopper_header(client, headers):
    assert client.get("/api/saved-carts", headers=headers).status_code == 400
    assert client.post("/api/saved-carts", json=_payload(), headers=headers).status_code == 400
    assert client.post("/api/saved-carts/any/restore", headers=headers).status_code == 400
    assert client.delete("/api/saved-carts/any", headers=headers).status_code == 400

    detail = client.get("/api/saved-carts", headers=headers).json()["detail"]
    assert "X-Shopper-Id" in detail


def test_create_returns_201_with_saved_prices_and_subtotal(client):
    store_id = _store_id()
    products = _catalog(store_id)[:2]
    response = client.post(
        "/api/saved-carts",
        json=_payload(store_id, count=2, name="  Weekly staples  "),
        headers=SHOPPER_A,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    assert body["name"] == "Weekly staples"
    assert body["store_id"] == store_id
    assert body["store_name"] == STORES[store_id].name
    assert body["item_count"] == 3
    assert body["subtotal"] == round(products[0]["price"] * 1 + products[1]["price"] * 2, 2)
    assert body["expires_at"] > body["created_at"]

    by_id = {item["product_id"]: item for item in body["items"]}
    assert set(by_id) == {products[0]["id"], products[1]["id"]}
    assert by_id[products[0]["id"]]["unit_price_at_save"] == products[0]["price"]
    assert by_id[products[0]["id"]]["current_price"] == products[0]["price"]
    assert by_id[products[0]["id"]]["name"] == products[0]["name"]
    assert all(item["available"] for item in body["items"])


def test_create_uses_ttl_days_for_expiry(client, monkeypatch):
    monkeypatch.setenv("SAVED_CART_TTL_DAYS", "7")
    body = client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).json()

    created = saved_carts.datetime.fromisoformat(body["created_at"])
    expires = saved_carts.datetime.fromisoformat(body["expires_at"])
    assert expires - created == timedelta(days=7)


def test_create_blank_name_is_null(client):
    body = client.post("/api/saved-carts", json=_payload(name="   "), headers=SHOPPER_A).json()
    assert body["name"] is None


def test_create_validates_store_via_require_store(client):
    missing = client.post("/api/saved-carts", json={**_payload(), "store_id": "   "}, headers=SHOPPER_A)
    assert missing.status_code == 400
    assert "store_id" in missing.json()["detail"]

    unknown = client.post(
        "/api/saved-carts", json={**_payload(), "store_id": "missing-store"}, headers=SHOPPER_A
    )
    assert unknown.status_code == 404
    assert "missing-store" in unknown.json()["detail"]


def test_create_rejects_products_from_another_store(client):
    first, second = _store_id(0), _store_id(1)
    foreign = _catalog(second)[0]["id"]
    payload = _payload(first, count=1)
    payload["items"].append({"product_id": foreign, "quantity": 1})

    response = client.post("/api/saved-carts", json=payload, headers=SHOPPER_A)
    assert response.status_code == 400
    assert foreign in response.json()["detail"]
    assert client.get("/api/saved-carts", headers=SHOPPER_A).json()["count"] == 0


def test_create_rejects_duplicate_product_ids(client):
    payload = _payload(count=1)
    payload["items"].append(dict(payload["items"][0]))

    response = client.post("/api/saved-carts", json=payload, headers=SHOPPER_A)
    assert response.status_code == 400
    assert "Duplicate" in response.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"store_id": "x"},
        {"store_id": "x", "items": []},
        {"store_id": "x", "items": [{"product_id": "p", "quantity": 0}]},
        {"store_id": "x", "items": [{"product_id": "p", "quantity": 100}]},
        {"store_id": "x", "items": [{"product_id": "", "quantity": 1}]},
        {"store_id": "x", "items": [{"product_id": "p", "quantity": 1}], "name": "n" * 121},
    ],
)
def test_create_rejects_malformed_payload(client, payload):
    assert client.post("/api/saved-carts", json=payload, headers=SHOPPER_A).status_code == 422


def test_eleventh_save_is_conflict(client):
    for _ in range(saved_carts.MAX_SAVED_CARTS):
        assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).status_code == 201

    response = client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A)
    assert response.status_code == 409
    assert "limit of 10" in response.json()["detail"]
    assert client.get("/api/saved-carts", headers=SHOPPER_A).json()["count"] == 10

    # The cap is per shopper, so another shopper is unaffected.
    assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_B).status_code == 201


def test_limit_frees_up_after_delete(client):
    ids = [
        client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).json()["id"]
        for _ in range(saved_carts.MAX_SAVED_CARTS)
    ]
    assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).status_code == 409
    assert client.delete(f"/api/saved-carts/{ids[0]}", headers=SHOPPER_A).status_code == 204
    assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).status_code == 201


def test_list_is_newest_first_with_current_price_subtotal(client, monkeypatch):
    store_id = _store_id()
    products = _catalog(store_id)
    first = client.post("/api/saved-carts", json=_payload(store_id, count=1), headers=SHOPPER_A).json()
    second = client.post("/api/saved-carts", json=_payload(store_id, count=2), headers=SHOPPER_A).json()

    # Simulate a price change after saving; subtotal follows the catalog, unit_price_at_save does not.
    repriced = [dict(p) for p in products]
    repriced[0]["price"] = round(products[0]["price"] + 10, 2)
    monkeypatch.setattr(saved_carts, "get_products_for_store", lambda store_id, limit=60: repriced)

    body = client.get("/api/saved-carts", headers=SHOPPER_A).json()
    assert body["count"] == 2
    assert body["limit"] == saved_carts.MAX_SAVED_CARTS
    assert [cart["id"] for cart in body["items"]] == [second["id"], first["id"]]

    newest = body["items"][0]
    assert newest["subtotal"] == round(repriced[0]["price"] * 1 + repriced[1]["price"] * 2, 2)
    assert newest["item_count"] == 3
    by_id = {item["product_id"]: item for item in newest["items"]}
    assert by_id[products[0]["id"]]["unit_price_at_save"] == products[0]["price"]
    assert by_id[products[0]["id"]]["current_price"] == repriced[0]["price"]
    for cart in body["items"]:
        assert set(cart) >= {"id", "name", "store_id", "store_name", "item_count", "subtotal", "expires_at", "created_at"}


def test_list_marks_unavailable_products(client, monkeypatch):
    store_id = _store_id()
    products = _catalog(store_id)
    client.post("/api/saved-carts", json=_payload(store_id, count=2), headers=SHOPPER_A)

    monkeypatch.setattr(saved_carts, "get_products_for_store", lambda store_id, limit=60: products[1:])

    cart = client.get("/api/saved-carts", headers=SHOPPER_A).json()["items"][0]
    missing = next(item for item in cart["items"] if item["product_id"] == products[0]["id"])
    assert missing["available"] is False
    assert missing["current_price"] is None
    assert missing["name"] is None
    assert cart["item_count"] == 3
    assert cart["subtotal"] == round(products[1]["price"] * 2, 2)


def test_shoppers_are_isolated(client):
    store_id = _store_id()
    created = client.post("/api/saved-carts", json=_payload(store_id), headers=SHOPPER_A).json()
    cart_id = created["id"]

    assert client.get("/api/saved-carts", headers=SHOPPER_B).json() == {
        "items": [],
        "count": 0,
        "limit": saved_carts.MAX_SAVED_CARTS,
    }

    restore = client.post(f"/api/saved-carts/{cart_id}/restore", headers=SHOPPER_B)
    assert restore.status_code == 404
    assert cart_id in restore.json()["detail"]

    delete = client.delete(f"/api/saved-carts/{cart_id}", headers=SHOPPER_B)
    assert delete.status_code == 404

    mine = client.get("/api/saved-carts", headers=SHOPPER_A).json()
    assert [cart["id"] for cart in mine["items"]] == [cart_id]


def test_restore_returns_cart_items_at_current_prices_and_deletes(client, monkeypatch):
    store_id = _store_id()
    products = _catalog(store_id)
    created = client.post("/api/saved-carts", json=_payload(store_id, count=2), headers=SHOPPER_A).json()

    repriced = [dict(p) for p in products]
    repriced[1]["price"] = round(products[1]["price"] + 1, 2)
    monkeypatch.setattr(saved_carts, "get_products_for_store", lambda store_id, limit=60: repriced)

    response = client.post(f"/api/saved-carts/{created['id']}/restore", headers=SHOPPER_A)
    assert response.status_code == 200
    body = response.json()
    assert body["store_id"] == store_id
    assert body["skipped"] == []
    assert body["items"] == [
        {**repriced[0], "quantity": 1},
        {**repriced[1], "quantity": 2},
    ]

    assert client.get("/api/saved-carts", headers=SHOPPER_A).json()["count"] == 0
    assert client.post(f"/api/saved-carts/{created['id']}/restore", headers=SHOPPER_A).status_code == 404


def test_restore_skips_products_no_longer_in_catalog(client, monkeypatch):
    store_id = _store_id()
    products = _catalog(store_id)
    created = client.post("/api/saved-carts", json=_payload(store_id, count=3), headers=SHOPPER_A).json()

    monkeypatch.setattr(saved_carts, "get_products_for_store", lambda store_id, limit=60: products[2:])

    body = client.post(f"/api/saved-carts/{created['id']}/restore", headers=SHOPPER_A).json()
    assert body["items"] == [{**products[2], "quantity": 3}]
    assert body["skipped"] == [
        {"product_id": products[0]["id"], "quantity": 1, "reason": "unavailable"},
        {"product_id": products[1]["id"], "quantity": 2, "reason": "unavailable"},
    ]
    assert client.get("/api/saved-carts", headers=SHOPPER_A).json()["count"] == 0


def test_restore_unknown_cart_is_not_found(client):
    response = client.post("/api/saved-carts/does-not-exist/restore", headers=SHOPPER_A)
    assert response.status_code == 404


def test_delete_returns_204_and_removes_items(client, saved_carts_db):
    created = client.post("/api/saved-carts", json=_payload(count=2), headers=SHOPPER_A).json()

    response = client.delete(f"/api/saved-carts/{created['id']}", headers=SHOPPER_A)
    assert response.status_code == 204
    assert response.content == b""

    assert client.delete(f"/api/saved-carts/{created['id']}", headers=SHOPPER_A).status_code == 404
    with saved_carts_db() as session:
        assert session.query(db.SavedCart).count() == 0
        assert session.query(db.SavedCartItem).count() == 0


def test_expired_carts_are_hidden_and_do_not_count_toward_limit(client, saved_carts_db):
    created = client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).json()
    for _ in range(saved_carts.MAX_SAVED_CARTS - 1):
        assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).status_code == 201
    assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).status_code == 409

    with saved_carts_db() as session:
        cart = session.get(db.SavedCart, created["id"])
        cart.expires_at = saved_carts._utcnow() - timedelta(seconds=1)
        session.commit()

    listed = client.get("/api/saved-carts", headers=SHOPPER_A).json()
    assert created["id"] not in [cart["id"] for cart in listed["items"]]
    assert listed["count"] == saved_carts.MAX_SAVED_CARTS - 1
    assert client.post(f"/api/saved-carts/{created['id']}/restore", headers=SHOPPER_A).status_code == 404
    assert client.post("/api/saved-carts", json=_payload(), headers=SHOPPER_A).status_code == 201
