# Ecommerce Simulator (FastAPI + React)

Small full-stack ecommerce simulation app with:

- Browse products
- Search products
- Add to cart (frontend state)

Backend attempts to pull products/images from the Amazon homepage. If Amazon blocks scraping or page markup does not match, it automatically falls back to a public product feed (`dummyjson`) so the app still works.

## Project Structure

- `backend/` - FastAPI API
- `frontend/` - React + Vite app

## Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Stripe Checkout setup

Add sandbox keys in `.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... # optional
```

Then use the cart "Checkout with Stripe" button in the frontend.

## Discount codes (guest checkout)

Guests can apply one discount code in the cart before checkout. Codes and their
rules live in `backend/discounts.py`. Seed codes:

| Code | Effect | Rules |
|---|---|---|
| `SAVE10` | 10% off | — |
| `5OFF` | $5 off | min spend $20 |
| `WELCOME100` | 100% off | total floors at $0 |
| `BIGSPEND` | $15 off | min spend $100 |
| `EXPIRED20` | 20% off | expired (rejected) |
| `USEDONCE` | $8 off | single-use, already redeemed (rejected) |
| `DISABLED` | 25% off | inactive (rejected) |

## API

- `GET /api/health`
- `GET /api/products?query=<text>&limit=<n>`
- `POST /api/discount/validate` — body `{ "code": "SAVE10", "subtotal": 100 }`
- `POST /api/checkout/session` — body accepts optional `"discount_code"`
- `GET /api/checkout/session-status?session_id=<id>`
- `POST /api/checkout/webhook` — Stripe-signed order confirmation

## Tests

See [`tests/README.md`](./tests/README.md) for the E2E (Playwright), integration
(Gherkin/Rest Assured), unit (Pytest), and performance (k6) suites.
