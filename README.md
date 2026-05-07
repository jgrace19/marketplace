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

## API

- `GET /api/health`
- `GET /api/products?query=<text>&limit=<n>`
- `POST /api/checkout/session`
