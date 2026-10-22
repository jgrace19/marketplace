# Anomaly-triage demo baseline

This branch (`demo/base`, tag `demo-baseline`) is the FreshCart target app for the BDK anomaly-triage demo.

A bot watches checkout metrics, a Cloud Agent compares recent commits and opens a fix PR, then a preview run of the same basket shows the metrics recover. Do not point that loop at `main`. `main` does not contain this baseline.

## The bug

Commit `d4b5255762f9aa833d3456f4b32177975b2ebc6a` (`refactor(checkout): price lines from the catalog unit amount`) changed `line_subtotal_cents` in `backend/pricing.py`.

Cart quotes, mock checkout, and booked GMV used to charge **unit price × pick quantity**. That refactor books **only the catalog unit price** for each line. Pick quantity is still counted on `freshcart.checkout.units`, and Stripe line items still send `unit_amount` plus `quantity` (existing checkout tests cover that path). The storefront subtotal and mock checkout both call the quote, so the cart total the shopper sees is the undercharge.

Single-quantity lines are unchanged, which is why a one-item order looks fine. Any line with quantity greater than 1 drops the extra units from the charged total.

The parent commit (`07e2f9cc42717fe2e327776e8cdbf737dd1e80c8`) has the correct extended total.

## Basket and metric impact

Fixed GreenMart basket, prices taken from the catalog:

| SKU | Item | Unit | Qty | Healthy line | Baseline line |
| --- | --- | ---: | ---: | ---: | ---: |
| `greenmart-grocery-1` | Organic Bananas (6 ct) | $3.49 | 3 | $10.47 | $3.49 |
| `greenmart-grocery-3` | 2% Milk - 1 Gallon | $4.29 | 2 | $8.58 | $4.29 |
| `greenmart-grocery-6` | Chicken Breast - 1.5 lb | $11.79 | 1 | $11.79 | $11.79 |
| `greenmart-grocery-7` | Baby Spinach - 10 oz | $3.99 | 1 | $3.99 | $3.99 |
|  | **Order total** |  | **7** | **$34.83** | **$23.56** |

Per order the charged subtotal falls by **1127 cents ($11.27), 32.36%**. Order count and unit count do not move.

`scripts/demo-checkout-metrics.py` places this basket **4 times** after clearing counters. Recorded `GET /api/metrics` values:

| Metric | Baseline (bug) | Healthy (quantity included) |
| --- | ---: | ---: |
| `freshcart.checkout.orders` | 4 | 4 |
| `freshcart.checkout.units` | 28 | 28 |
| `freshcart.checkout.gmv_cents` | 9424 | 13932 |
| `freshcart.checkout.average_order_value_cents` | 2356 | 3483 |

GMV for the sample is **$94.24** instead of **$139.32** (same 32.36% drop, **$45.08**). Average order value is **$23.56** instead of **$34.83**.

## Metrics to emit

On each mock checkout the API writes one stdout JSON line (`event` = `checkout.completed`) and adds to the in-process counters. Scrape the running totals at `GET /api/metrics`:

- `freshcart.checkout.orders` — completed mock checkouts. Flat across the bug.
- `freshcart.checkout.units` — sum of pick quantities. Flat across the bug.
- `freshcart.checkout.gmv_cents` — sum of charged subtotals in cents. Drops.
- `freshcart.checkout.average_order_value_cents` — `gmv_cents / orders`, rounded to the nearest cent. Drops.

The per-order log line uses the same names. For a single order, `freshcart.checkout.gmv_cents` and `freshcart.checkout.average_order_value_cents` in that line are that order's subtotal (2356 on the baseline basket, 3483 once fixed). `GET /api/metrics` is the aggregate.

Counters live in memory and reset when the process restarts. `POST /api/metrics/reset` clears them only while checkout is in mock mode (no `STRIPE_SECRET_KEY`).

## Run locally (no secrets)

Mock checkout is the default when `STRIPE_SECRET_KEY` is unset. Do not put a Stripe or Datadog key in the environment for this demo.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

In another shell:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Pick GreenMart, add the basket above (bananas ×3, milk ×2, chicken ×1, spinach ×1), and open the cart. The subtotal shows **$23.56**. Checkout places a mock order and confirms that charge. A correct total is **$34.83**.

Reproduce the aggregate from the repo root while the API is on port 8000:

```bash
python3 scripts/demo-checkout-metrics.py --check baseline
```

`--check baseline` exits 0 only when the four metrics match the baseline column. After a fix, the same command with `--check healthy` should pass and `--check baseline` should fail.

Backend tests do not pin the extended price of a multi-quantity line, so `pytest` stays green on this baseline. From `backend/` with `requirements-dev.txt` installed: `pytest`.

## Reset the demo branch

`scripts/demo-reset.sh` moves `demo/base` back to tag `demo-baseline`.

- It refuses to run while `HEAD` is `main` or `master`.
- The only ref it publishes is `refs/heads/demo/base`, and only with `--force-with-lease` against the remote SHA it just fetched.
- If that reset would drop commits that are on `demo/base` but not on the tag, it exits non-zero unless you pass `--yes`.

```bash
# from any branch other than main/master
scripts/demo-reset.sh          # fails if commits would be dropped
scripts/demo-reset.sh --yes    # discard those commits and return to the tag
```

Checkout `demo/base` after a reset before running the app. The tag is the answer key for the buggy baseline, not a fix.
