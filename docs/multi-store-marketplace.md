# Multi-Store Marketplace

## Goal

Close the largest product gap vs Instacart: FreshCart today is a **single flat catalog**. Instacart’s entry point is choosing among nearby retailers, then shopping that store’s catalog.

This feature adds a **demo marketplace with a fake service area**—location-aware in UX shape, without real geo, store directories, or retailer partnerships.

## Constraints

- No real store inventory or retailer APIs
- No real geolocation, geocoding, or delivery-radius math
- Stay on the existing FastAPI + React stack (no DB required for v1)
- Reuse the grocery fallback catalog where possible

## Core idea

Pick one fictional metro (e.g. “FreshCart City” / hardcoded zip `10002`) and ship:

1. A **static store registry**
2. **Store-scoped product catalogs**

Users can “change location,” but the backend does not geocode. It returns the same mock store set, or a few canned zip → store-list mappings.

That mirrors Instacart’s flow (**pick a store → shop that catalog**) without Mapbox, Places, or partnerships.

## Data model (v1)

Extend beyond the flat `Product` + `source` field:

```text
Store {
  id
  name
  slug
  logo_url
  tags[]            # e.g. grocery, offers, ebt, pickup, fastest, low-prices
  eta_label         # e.g. "By 8:00pm"
  distance_mi       # display-only mock
  supports_pickup
  supports_ebt
}

Product {
  ...existing fields
  store_id
  aisle?            # optional for later aisle browsing
}
```

Hardcode ~6–10 stores (e.g. Wegmans-like, Costco-like, Target-like, pharmacy, convenience) as JSON or Python constants in `backend/`.

Assign grocery fallback products a `store_id`. Optionally duplicate a few SKUs across stores with different prices so the multi-retailer story is visible.

## Location without geo

Three options, in increasing fidelity:

| Option | Behavior | Notes |
|--------|----------|--------|
| **Fixed city** | Header shows “Stores near FreshCart City.” No address input. | Simplest |
| **Canned zip picker** | Dropdown of zips (`10002`, `94107`, `60614`) each mapped to a slightly different store list / ETAs | Feels location-aware; still fake |
| **Free-text address (no geocode)** | Accept anything, persist in profile `localStorage`, always resolve to the default service area | Good demo theater |

Skip browser geolocation unless you want a permission prompt that still falls back to the mock area.

**Recommendation for first ship:** canned zip picker (option 2).

## API / UX flow

Fits the current SPA (`activePage` navigation; no router required).

1. **Stores landing** (before today’s product grid)  
   `GET /api/stores?zip=10002` → store list. Apply filters (All / Fastest / Offers / Pickup / EBT) in memory from `tags` / flags.

2. **Select store**  
   Set `selectedStoreId` in React state (and optionally `localStorage`).

3. **Shop that store**  
   `GET /api/products?store_id=wegmans&query=` — filter the catalog by `store_id`.

4. **Cart rule (v1)**  
   One store per cart (Instacart-like). Adding from another store prompts “Start a new cart?” or blocks until cleared.

Stripe checkout can stay as-is. Optionally stamp `store_name` / `store_id` on Checkout session metadata for demos.

## Out of scope (v1)

- Real lat/lng, delivery radius, or “nearest store”
- Live inventory per store
- Multi-store carts / batching
- Scraping real retailer sites
- Delivery vs pickup scheduling and live shopper tracking (separate feature gaps)

## Implementation order

1. Static `STORES` registry + assign products to `store_id`
2. Store picker UI + `store_id` query on product fetch
3. Fake filters (ETA / tags) and zip → store-list mapping
4. One-store cart constraint

## Success criteria

- User lands on a store list (not a global product grid)
- User can filter stores by at least a few mock facets
- User selects a store and only sees that store’s products
- Cart cannot mix items from two stores without an explicit reset
- Changing zip (if implemented) changes which stores/ETAs appear, without any real geocoding
