# Instacart Cart Parity — Product Gaps for FreshCart

Research note from browsing Instacart (home + Target storefront + cart drawer) against FreshCart’s current multi-store marketplace. Focus is **functional product behavior**, not visual pixel-matching.

**Observed Instacart session:** logged-in shopper at `40 Harrison Street` / zip `10013`, with concurrent carts at Target (9 items), Morton Williams (8), and The Container Store (3). Header aggregate count: **18**.

**FreshCart baseline (today):** one in-memory cart tied to one store; sticky Shop sidebar; confirm-before-replace when adding from another store; Stripe Checkout; cart not persisted. See also [multi-store-marketplace.md](./multi-store-marketplace.md) (v1 explicitly outscoped multi-store carts).

---

## What Instacart does (cart model)

### 1. Multiple concurrent store carts

Instacart does **not** force a single active cart. Each retailer has its own cart that lives independently:

| Store | Role observed |
|-------|----------------|
| Target | Personal cart, delivery ETA, ~$91 subtotal |
| Morton Williams Supermarket | Separate personal cart |
| The Container Store | Separate personal cart |

Users can keep shopping any of them without wiping the others. Checkout is **per store** (`Go to checkout $91.50` on the open store cart), not one batched multi-retailer checkout.

### 2. Two cart surfaces

**A. Carts hub (marketplace / home)**  
Header control: `View Cart. Items in cart: 18` (sum across stores). Opens a **Carts** screen titled “Shopping in {zip}” with one card per active cart:

- Store logo + name  
- Label: **Personal Cart**  
- Delivery ETA (e.g. “Delivery by 8:00pm”)  
- Horizontal thumbnails of items in that cart  
- Primary CTA: **Continue Shopping** (returns to that store)  
- Overflow (`…`): **Delete cart** (also path to family-cart options)

**B. Store cart drawer (inside a storefront)**  
Header control is store-scoped, e.g.  
`View Cart. Items in cart: 9, $0 delivery fee + saving $4.10`.  
Opens a right-side **Cart** dialog for that store only:

- Title: **Personal {Store} Cart** + “Shopping in {zip}”  
- Store logo, delivery window, running subtotal  
- Promo progress (e.g. “Buy $45, get $8 off” / “Add $25.01 to get this offer”)  
- Line items: image, name/size, price (+ strikethrough original), qty controls, **Replace with best match**  
- Qty at 1 uses trash (remove); otherwise decrement  
- **Complete your cart** recommendation rail (add more without leaving cart)  
- Switcher chips to **other open store carts** (e.g. “Morton Williams Supermarket Personal Cart +2”)  
- Sticky **Go to checkout ${total}** + savings / Instacart+ delivery-fee messaging  
- Invite / family cart entry points

### 3. How items are added

On storefront product cards:

1. Primary control is **+ Add** on the product image (one tap; no PDP required).  
2. After add, the control becomes an **inline quantity control** (trash / qty / +) or a compact **qty badge** (`1 ct`).  
3. Header cart count and fee/savings copy update immediately.  
4. User stays on the browse page—no cart page navigation required to add.

Home / “Your stores” tiles also surface **“N in cart”** on stores that already have an active cart, so multi-cart state is visible before opening the hub.

### 4. Persistence & context

- Carts persist for the account/session (survived navigation home ↔ storefront).  
- Fulfillment context is always visible: **Delivery | Pickup**, address, and ETA window in the storefront header.  
- Pricing/fee transparency appears near store branding (service fee, regulatory fees, bag fee, “higher than in-store” style disclosures).  
- Carts are labeled **Personal** vs family/shared cart concepts (out of demo scope unless we want a light mock).

---

## What FreshCart does today

| Area | FreshCart today |
|------|-----------------|
| Cart cardinality | **One** cart, one `cartStoreId` |
| Cross-store add | `window.confirm` → replace entire cart or abort |
| Cart UI | Sticky **sidebar on Shop only**; not a drawer; not on Stores/Profile |
| Header badge | Green `Cart {count}` pill — **not clickable** |
| Persistence | Cart lost on refresh (zip/store/profile use `localStorage`) |
| Add UX | “Add” on product card → qty +/- only inside sidebar |
| Checkout | Stripe redirect for the single cart |
| Delivery / fees / substitutions / cart upsells | Not present |
| Multi-cart hub | Not present |

---

## Product changes needed (priority order)

These are functional product requirements to feel closer to Instacart. Implementation detail can stay mock/demo-grade (no real inventory, fees, or shoppers).

### P0 — Multi-cart + cart entry points

1. **Multiple store carts**  
   Maintain a map of carts keyed by `store_id` (items + quantities). Adding at store B must **not** destroy store A’s cart. Retire the “Start a new cart?” replace flow as the primary model (optional “clear this store’s cart” remains).

2. **Clickable global cart control**  
   Header badge opens the right surface for context:
   - On **Stores / home**: open **Carts hub** (list of non-empty store carts).  
   - On **Shop (in a store)**: open **that store’s cart drawer** (not only the sticky sidebar).

3. **Carts hub**  
   Card per active cart: store identity, item count or thumbnails, ETA label (reuse mock `eta_label`), **Continue shopping** → select store + Shop, overflow **Delete cart**. Show zip/location line (“Shopping in {zip}”). Aggregate item count on the header badge.

4. **Persist carts**  
   Persist multi-cart state in `localStorage` (same pattern as zip/store). Survive refresh and page switches.

### P1 — In-store cart drawer & add UX

5. **Store cart drawer**  
   Replace or complement the always-visible Shop sidebar with a slide-over / panel opened from the header (and optionally still peek at totals). Include: store name, line items with image/name/price, qty +/- / remove, subtotal, primary **Checkout** CTA.

6. **Inline add → quantity control on product cards**  
   After first add, product card shows qty controls (or a qty badge) so users adjust without opening the cart. Header count updates live.

7. **“N in cart” on store cards**  
   On the Stores landing, badge stores that have a non-empty cart so multi-cart state is discoverable.

8. **Switch between open carts from the drawer**  
   Light Instacart-like chips listing other non-empty carts so users can jump without returning to the hub first.

### P2 — Checkout & fulfillment theater (still mock-friendly)

9. **Per-store checkout**  
   Checkout always targets the **active store cart** only. Clearing that cart after success must leave other store carts intact.

10. **Delivery vs pickup + ETA copy**  
    Storefront header (or cart drawer) shows fulfillment mode and mock ETA (data already partly exists on stores as `eta_label` / pickup flags). Does not need real scheduling.

11. **Fee / savings messaging (demo)**  
    Cart CTA area can show mock delivery-fee or “order minimum” progress (e.g. “Spend $X more for free delivery”) so the cart feels like a fulfillment summary, not only a line-item list.

12. **Substitution preference (lightweight)**  
    Per line item, a simple preference: “Replace with best match” / “Don’t replace” stored on the cart line. No shopper workflow required for demo.

### P3 — Nice-to-have parity (lower priority for demo)

13. **Complete your cart** recommendations inside the drawer (hardcoded or “same aisle / popular at this store”).  
14. **Promo progress banners** tied to mock offer rules.  
15. **Family / shared cart** — skip unless a specific demo needs it.  
16. **Server-side cart API** — optional later; client `localStorage` is enough for demo fidelity.

---

## Explicit non-goals (for this parity pass)

- Real delivery routing, shopper assignment, or live tracking  
- True multi-retailer single checkout / split tender across stores  
- Real retailer inventory, loyalty linking, or Instacart+ billing  
- Pixel-perfect Instacart UI (match interaction model and information architecture)

---

## Suggested acceptance criteria

- User can hold items in **≥2 store carts** at once without confirm-replace.  
- Header cart opens a **hub** from Stores and a **store drawer** from Shop.  
- Hub lists each non-empty cart with store name + path back to that store.  
- Adding an item updates product-card qty UI and header count without navigation.  
- Refresh preserves all store carts.  
- Checking out store A clears only cart A; cart B remains.  
- Stores list shows which stores already have items in cart.

---

## Mapping to existing docs

[multi-store-marketplace.md](./multi-store-marketplace.md) shipped store picker + one-store cart as v1. That closed the “flat catalog” gap. **This doc is the next product slice:** treat “one store per cart” as **one cart object per store**, with many carts coexisting—matching Instacart’s actual multi-cart hub and store drawer behavior observed above.
)
