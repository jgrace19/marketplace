from copy import deepcopy

import pytest

from stores import (
    _BASE_GROCERY,
    _CROSS_STORE_DUPLICATES,
    _STORE_CATALOG_SLICES,
    DEFAULT_ZIP,
    STORE_PRODUCTS,
    STORES,
    SUPPORTED_ZIPS,
    ZIP_STORE_OVERRIDES,
    get_products_for_store,
    get_stores_for_zip,
)


def test_catalog_partition_and_cross_store_price_overrides():
    ids = [product["id"] for product in STORE_PRODUCTS]
    assert len(ids) == len(set(ids)), "product ids must be unique across stores"
    assert set(_STORE_CATALOG_SLICES) == set(STORES)

    for store_id in STORES:
        owned = get_products_for_store(store_id)
        assert owned, f"store '{store_id}' has an empty catalog"
        assert all(product["id"].startswith(f"{store_id}-") for product in owned)
        assert all(product["store_id"] == store_id for product in owned)
        assert all(product["source"] == "grocery-fallback" for product in owned)
        assert len(get_products_for_store(store_id, limit=1)) == 1

    assert get_products_for_store("missing-store") == []

    by_id = {product["id"]: product for product in STORE_PRODUCTS}
    for store_id, base_idx, override_price in _CROSS_STORE_DUPLICATES:
        base = _BASE_GROCERY[base_idx]
        duplicate = by_id[f"{store_id}-{base['base_id']}"]
        assert duplicate["price"] == pytest.approx(override_price)
        assert duplicate["price"] != pytest.approx(base["price"])
        assert duplicate["name"] == base["name"]
        assert duplicate["image_url"] == base["image_url"]


def test_zip_overrides_do_not_mutate_registry_or_leak_across_zips():
    pristine = deepcopy(STORES)
    overridden_zip = next(zip_code for zip_code in SUPPORTED_ZIPS if zip_code != DEFAULT_ZIP)
    assert any(ZIP_STORE_OVERRIDES[overridden_zip].values()), "fixture needs a zip with overrides"

    _, overridden_items = get_stores_for_zip(overridden_zip)
    _, default_items = get_stores_for_zip(DEFAULT_ZIP)

    assert STORES == pristine
    for item in overridden_items:
        for key, value in ZIP_STORE_OVERRIDES[overridden_zip][item["id"]].items():
            assert item[key] == value

    for item in default_items:
        store = STORES[item["id"]]
        assert item["eta_label"] == store.eta_label
        assert item["distance_mi"] == store.distance_mi
        assert item["tags"] == store.tags
        assert item["tags"] is not store.tags
