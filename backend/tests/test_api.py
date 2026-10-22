import re
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import main
from stores import DEFAULT_ZIP, STORES, SUPPORTED_ZIPS, ZIP_STORE_OVERRIDES


def _store_id() -> str:
    return next(iter(STORES))


def _sample_item(**overrides: object) -> dict:
    item = {
        "id": "sku-1",
        "name": "Sample Item",
        "price": 3.49,
        "quantity": 2,
    }
    item.update(overrides)
    return item


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("zip_code", SUPPORTED_ZIPS)
def test_stores_for_supported_zip(client, zip_code):
    body = client.get("/api/stores", params={"zip": zip_code}).json()
    expected_ids = list(ZIP_STORE_OVERRIDES[zip_code])

    assert body["zip"] == zip_code
    assert body["count"] == len(body["items"]) == len(expected_ids)
    assert [item["id"] for item in body["items"]] == expected_ids
    for item in body["items"]:
        assert item["slug"] == item["id"]
        for key, value in ZIP_STORE_OVERRIDES[zip_code][item["id"]].items():
            assert item[key] == value


@pytest.mark.parametrize("zip_code", ["99999", "", "   ", "not-a-zip"])
def test_unknown_zip_falls_back_to_default(client, zip_code):
    body = client.get("/api/stores", params={"zip": zip_code}).json()
    assert body["zip"] == DEFAULT_ZIP
    assert [item["id"] for item in body["items"]] == list(ZIP_STORE_OVERRIDES[DEFAULT_ZIP])


def test_zip_is_trimmed(client):
    zip_code = SUPPORTED_ZIPS[0]
    body = client.get("/api/stores", params={"zip": f"  {zip_code}  "}).json()
    assert body["zip"] == zip_code


def test_products_require_known_store(client):
    missing = client.get("/api/products")
    assert missing.status_code == 400
    assert "store_id" in missing.json()["detail"]

    blank = client.get("/api/products", params={"store_id": "   "})
    assert blank.status_code == 400

    unknown = client.get("/api/products", params={"store_id": "missing-store"})
    assert unknown.status_code == 404
    assert "missing-store" in unknown.json()["detail"]


def test_store_id_is_trimmed(client):
    store_id = _store_id()
    body = client.get("/api/products", params={"store_id": f"  {store_id}  ", "limit": 60}).json()
    assert body["store_id"] == store_id
    assert body["count"] == len(body["items"]) > 0


def test_products_are_store_scoped_and_respect_limit(client):
    first, second = list(STORES)[:2]

    limited = client.get("/api/products", params={"store_id": first, "limit": 1}).json()
    assert limited["count"] == 1
    assert limited["items"][0]["store_id"] == first
    assert limited["items"][0]["id"].startswith(f"{first}-")

    full_first = client.get("/api/products", params={"store_id": first, "limit": 60}).json()
    full_second = client.get("/api/products", params={"store_id": second, "limit": 60}).json()
    assert full_first["count"] > 1
    assert full_second["count"] > 0
    assert {item["id"] for item in full_first["items"]}.isdisjoint(
        {item["id"] for item in full_second["items"]}
    )
    assert all(item["store_id"] == second for item in full_second["items"])


@pytest.mark.parametrize("limit", [0, 61])
def test_product_limit_bounds(client, limit):
    response = client.get("/api/products", params={"store_id": _store_id(), "limit": limit})
    assert response.status_code == 422


def test_product_search_matches_partial_terms(client):
    store_id = _store_id()
    catalog = client.get("/api/products", params={"store_id": store_id, "limit": 60}).json()["items"]
    token = re.findall(r"[a-z0-9]+", catalog[0]["name"].lower())[0]
    fragment = token[: max(3, len(token) // 2)]

    body = client.get("/api/products", params={"store_id": store_id, "query": fragment}).json()
    assert body["count"] >= 1
    assert all(
        any(
            fragment in term
            for term in re.findall(r"[a-z0-9]+", f"{item['name']} {item['description']}".lower())
        )
        for item in body["items"]
    )


def test_product_search_with_no_match_is_empty(client):
    store_id = _store_id()
    body = client.get(
        "/api/products",
        params={"store_id": store_id, "query": "zzzznotaproduct"},
    ).json()
    assert body == {"items": [], "count": 0, "store_id": store_id}


def test_recommendations_follow_deal_rule(client):
    store_id = _store_id()
    catalog = client.get("/api/products", params={"store_id": store_id, "limit": 60}).json()["items"]
    under_four = [item for item in catalog if item["price"] < 4]
    expected = under_four or sorted(catalog, key=lambda item: item["price"])[:5]

    body = client.get("/api/recommendations", params={"store_id": store_id}).json()
    prices = [item["price"] for item in body["items"]]

    assert body["store_id"] == store_id
    assert [item["id"] for item in body["items"]] == [item["id"] for item in expected]
    assert body["average_deal_price"] == round(sum(prices) / len(prices), 2)


def test_recommendations_require_known_store(client):
    assert client.get("/api/recommendations").status_code == 400
    assert client.get("/api/recommendations", params={"store_id": "missing-store"}).status_code == 404


def test_recommendations_fall_back_to_cheapest_when_none_under_four(client, monkeypatch):
    store_id = _store_id()
    prices = [9.0, 4.5, 8.0, 6.0, 7.5, 5.0]
    products = [
        main.Product(
            id=f"sku-{index}",
            name=f"Item {index}",
            description="Pantry staple",
            price=price,
            image_url="",
            source="grocery-fallback",
            store_id=store_id,
        )
        for index, price in enumerate(prices)
    ]
    monkeypatch.setattr(main, "get_store_products", lambda store_id, limit=24: products)

    body = client.get("/api/recommendations", params={"store_id": store_id}).json()
    cheapest = sorted(prices)[:5]

    assert [item["price"] for item in body["items"]] == cheapest
    assert body["average_deal_price"] == round(sum(cheapest) / len(cheapest), 2)
    assert body["store_id"] == store_id


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"items": []},
        {"items": [_sample_item(quantity=0)]},
        {"items": [_sample_item(quantity=100)]},
        {"items": [_sample_item(price=0)]},
        {"items": [_sample_item(id="")]},
        {"items": [_sample_item(name="")]},
    ],
)
def test_checkout_rejects_invalid_cart(client, payload):
    assert client.post("/api/checkout/session", json=payload).status_code == 422


def test_checkout_requires_stripe_key(client):
    response = client.post("/api/checkout/session", json={"items": [_sample_item()]})
    assert response.status_code == 500
    assert "STRIPE_SECRET_KEY" in response.json()["detail"]


def test_checkout_builds_line_items_in_cents(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    store_id = _store_id()
    store_name = STORES[store_id].name
    fake = SimpleNamespace(url="https://checkout.example.test/s", id="cs_test_123456")
    payload = {
        "items": [
            _sample_item(price=3.49, quantity=2, image_url="https://example.test/item.png"),
            _sample_item(id="sku-2", name="Second Item", price=1.15, quantity=1),
        ],
        "store_id": store_id,
        "store_name": store_name,
    }

    with patch.object(main.stripe.checkout.Session, "create", return_value=fake) as create:
        response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 200
    assert response.json() == {"checkout_url": fake.url, "session_id": fake.id}
    kwargs = create.call_args.kwargs
    assert kwargs["mode"] == "payment"
    assert kwargs["metadata"] == {"store_id": store_id, "store_name": store_name}
    assert kwargs["success_url"] == (
        f"{main.FRONTEND_URL}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}"
    )
    assert kwargs["cancel_url"] == f"{main.FRONTEND_URL}/?checkout=cancel"
    first, second = kwargs["line_items"]
    assert first["price_data"]["unit_amount"] == 349
    assert first["quantity"] == 2
    assert first["price_data"]["product_data"]["images"] == ["https://example.test/item.png"]
    assert second["price_data"]["unit_amount"] == 115
    assert second["quantity"] == 1
    assert "images" not in second["price_data"]["product_data"]


def test_checkout_omits_metadata_without_store(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    fake = SimpleNamespace(url="https://checkout.example.test/s", id="cs_test_123456")

    with patch.object(main.stripe.checkout.Session, "create", return_value=fake) as create:
        response = client.post("/api/checkout/session", json={"items": [_sample_item()]})

    assert response.status_code == 200
    assert "metadata" not in create.call_args.kwargs


def _checkout_with_fake_stripe(client, payload):
    fake = SimpleNamespace(url="https://checkout.example.test/s", id="cs_test_123456")
    with patch.object(main.stripe.checkout.Session, "create", return_value=fake) as create:
        response = client.post("/api/checkout/session", json=payload)
    return response, create


def test_checkout_encodes_one_substitution_per_line(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {
        "items": [
            _sample_item(id="greenmart-grocery-0", name="Bananas"),
            _sample_item(id="greenmart-grocery-2", name="Milk"),
            _sample_item(id="greenmart-grocery-3", name="Eggs"),
        ],
        "store_id": _store_id(),
        "substitutions": [
            {"product_id": "greenmart-grocery-2", "preference": "best_match"},
            {"product_id": "greenmart-grocery-0", "preference": "no_replace"},
        ],
    }

    response, create = _checkout_with_fake_stripe(client, payload)

    assert response.status_code == 200
    metadata = create.call_args.kwargs["metadata"]
    assert metadata["store_id"] == _store_id()
    assert metadata["substitutions"] == (
        "greenmart-grocery-0:n,greenmart-grocery-2:b,greenmart-grocery-3:b"
    )
    assert "substitutions_truncated" not in metadata


def test_checkout_substitutions_without_store_still_write_metadata(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {
        "items": [_sample_item()],
        "substitutions": [{"product_id": "sku-1", "preference": "no_replace"}],
    }

    response, create = _checkout_with_fake_stripe(client, payload)

    assert response.status_code == 200
    assert create.call_args.kwargs["metadata"] == {"substitutions": "sku-1:n"}


def test_checkout_substitution_preference_defaults_to_best_match(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {"items": [_sample_item()], "substitutions": [{"product_id": "sku-1"}]}

    response, create = _checkout_with_fake_stripe(client, payload)

    assert response.status_code == 200
    assert create.call_args.kwargs["metadata"]["substitutions"] == "sku-1:b"


@pytest.mark.parametrize(
    "substitutions",
    [
        [{"product_id": "sku-1", "preference": "maybe"}],
        [{"product_id": "", "preference": "no_replace"}],
        [{"preference": "no_replace"}],
        "sku-1:n",
    ],
)
def test_checkout_rejects_malformed_substitutions(client, monkeypatch, substitutions):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {"items": [_sample_item()], "substitutions": substitutions}

    with patch.object(main.stripe.checkout.Session, "create") as create:
        response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 422
    create.assert_not_called()


def test_checkout_rejects_substitution_for_unknown_item(client):
    payload = {
        "items": [_sample_item()],
        "substitutions": [{"product_id": "sku-404", "preference": "no_replace"}],
    }

    with patch.object(main.stripe.checkout.Session, "create") as create:
        response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 400
    assert "sku-404" in response.json()["detail"]
    create.assert_not_called()


def test_checkout_rejects_duplicate_substitution(client):
    payload = {
        "items": [_sample_item()],
        "substitutions": [
            {"product_id": "sku-1", "preference": "no_replace"},
            {"product_id": "sku-1", "preference": "best_match"},
        ],
    }

    response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 400
    assert "Duplicate" in response.json()["detail"]


def test_checkout_truncates_substitutions_at_pair_boundary(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    product_ids = [f"megavalue-grocery-{index:02d}-long-sku-identifier" for index in range(20)]
    payload = {
        "items": [_sample_item(id=product_id, name=f"Item {product_id}") for product_id in product_ids],
        "substitutions": [{"product_id": product_id, "preference": "no_replace"} for product_id in product_ids],
    }

    response, create = _checkout_with_fake_stripe(client, payload)

    assert response.status_code == 200
    metadata = create.call_args.kwargs["metadata"]
    encoded = metadata["substitutions"]
    assert len(encoded) <= main.STRIPE_METADATA_VALUE_LIMIT
    pairs = encoded.split(",")
    assert pairs == [f"{product_id}:n" for product_id in product_ids[: len(pairs)]]
    assert 0 < len(pairs) < len(product_ids)
    assert metadata["substitutions_truncated"] == str(len(product_ids) - len(pairs))


def test_checkout_rejects_sub_cent_price(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    payload = {"items": [_sample_item(price=0.001, quantity=1)]}

    with patch.object(main.stripe.checkout.Session, "create") as create:
        response = client.post("/api/checkout/session", json=payload)

    assert response.status_code == 400
    assert "Invalid price" in response.json()["detail"]
    create.assert_not_called()


def test_checkout_stripe_error_is_bad_gateway(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")

    with patch.object(
        main.stripe.checkout.Session,
        "create",
        side_effect=RuntimeError("stripe down"),
    ):
        response = client.post("/api/checkout/session", json={"items": [_sample_item()]})

    assert response.status_code == 502
    assert "stripe down" in response.json()["detail"]


def test_session_status_requires_stripe_key(client):
    with patch.object(main.stripe.checkout.Session, "retrieve") as retrieve:
        response = client.get(
            "/api/checkout/session-status",
            params={"session_id": "cs_test_123456"},
        )

    assert response.status_code == 500
    assert "STRIPE_SECRET_KEY" in response.json()["detail"]
    retrieve.assert_not_called()


@pytest.mark.parametrize("session_id", ["short", ""])
def test_session_status_rejects_short_id(client, session_id):
    response = client.get("/api/checkout/session-status", params={"session_id": session_id})
    assert response.status_code == 422


def test_session_status_returns_payment_fields(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    store_id = _store_id()
    store_name = STORES[store_id].name
    fake = SimpleNamespace(
        id="cs_test_123456",
        status="complete",
        payment_status="paid",
        customer_details=SimpleNamespace(email="buyer@example.com"),
        amount_total=698,
        currency="usd",
        metadata={"store_id": store_id, "store_name": store_name},
    )

    with patch.object(main.stripe.checkout.Session, "retrieve", return_value=fake) as retrieve:
        response = client.get(
            "/api/checkout/session-status",
            params={"session_id": "cs_test_123456"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "session_id": "cs_test_123456",
        "status": "complete",
        "payment_status": "paid",
        "customer_email": "buyer@example.com",
        "amount_total": 698,
        "currency": "usd",
        "store_id": store_id,
        "store_name": store_name,
        "substitutions": "",
    }
    retrieve.assert_called_once_with("cs_test_123456")


def test_session_status_echoes_substitutions(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    fake = SimpleNamespace(
        id="cs_test_123456",
        status="complete",
        payment_status="paid",
        customer_details=None,
        amount_total=698,
        currency="usd",
        metadata={"store_id": _store_id(), "substitutions": "sku-1:n,sku-2:b"},
    )

    with patch.object(main.stripe.checkout.Session, "retrieve", return_value=fake):
        body = client.get(
            "/api/checkout/session-status",
            params={"session_id": "cs_test_123456"},
        ).json()

    assert body["substitutions"] == "sku-1:n,sku-2:b"


def test_session_status_handles_missing_customer_and_metadata(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")
    fake = SimpleNamespace(
        id="cs_test_654321",
        status="open",
        payment_status="unpaid",
        customer_details=None,
        amount_total=None,
        currency="usd",
        metadata=None,
    )

    with patch.object(main.stripe.checkout.Session, "retrieve", return_value=fake):
        response = client.get(
            "/api/checkout/session-status",
            params={"session_id": "cs_test_654321"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["customer_email"] is None
    assert body["amount_total"] is None
    assert body["store_id"] == ""
    assert body["store_name"] == ""
    assert body["substitutions"] == ""


def test_session_status_stripe_error_is_not_found(client, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_example")

    with patch.object(
        main.stripe.checkout.Session,
        "retrieve",
        side_effect=RuntimeError("no such session"),
    ):
        response = client.get(
            "/api/checkout/session-status",
            params={"session_id": "cs_test_missing"},
        )

    assert response.status_code == 404
    assert "no such session" in response.json()["detail"]
