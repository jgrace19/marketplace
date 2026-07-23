# AGENTS.md

## Cursor Cloud specific instructions

This repo is a full-stack ecommerce simulator ("FreshCart"). The runnable product is two
services; everything else (`docker-compose.yml`, `k8s/`, `monitoring/`, `scripts/`) is
optional observability/CI tooling.

### Services

- **Backend** — FastAPI in `backend/main.py`. Run for local dev:
  `backend/.venv/bin/uvicorn main:app --reload --port 8000` (from `backend/`).
  API base is `http://127.0.0.1:8000`; key routes are documented in `README.md` (`/api/health`,
  `/api/products`, `/api/checkout/session`).
- **Frontend** — React + Vite in `frontend/`. Run for local dev: `npm run dev` (serves on
  `http://localhost:5173`). It calls the backend at `VITE_API_BASE` (defaults to
  `http://127.0.0.1:8000`), so start the backend first.

### Non-obvious caveats

- The Python venv relies on the `python3.12-venv` system package (the base image's Python
  lacks `ensurepip`). It is already present in the environment snapshot; the update script only
  refreshes the venv/pip/npm deps, it does not reinstall system packages.
- `get_products()` first tries to scrape `amazon.com`, which is blocked by cloud egress, so it
  silently falls back to the built-in `GROCERY_FALLBACK_PRODUCTS` list. This is expected — the
  product grid is always populated offline. Search filters this same list.
- `GET /api/recommendations` (the "Today's Deals" button) intentionally returns HTTP 500
  (division by zero when no item is under $1.00). This is a deliberate demo bug — do not "fix" it
  unless a task explicitly asks for it.
- Stripe checkout (`/api/checkout/session`) requires `STRIPE_SECRET_KEY`; without it the endpoint
  returns 500 by design. Browse / search / add-to-cart work with no secrets or external services.
- There are no automated test or lint suites wired up in this repo (no pytest/eslint config);
  verify changes by running the two dev servers and exercising the UI/API.

### Optional infra (needs credentials, not required for dev)

- `docker compose up --build` and `k8s/deploy.sh` bring up the app plus a Datadog Agent and
  require `DD_API_KEY`/`DD_SITE` in `.env`. See `README.md`.
- `scripts/` is a TypeScript cloud-agent orchestrator used in CI (needs Cursor/Linear API keys);
  it is not part of running the product.
