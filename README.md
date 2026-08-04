# Ecommerce Simulator (FastAPI + React)

Small full-stack ecommerce simulation app (FreshCart) with:

- Multi-store marketplace (pick a nearby store, then shop that catalog)
- Canned zip → store list mapping (demo location, no geocoding)
- Store-scoped product search
- Multi-store carts (persisted in localStorage) + per-store Stripe Checkout

Catalog data is a static grocery fallback partitioned by store (see `backend/stores.py`).

## Project Structure

- `backend/` - FastAPI API (`main.py`, `stores.py`)
- `frontend/` - React + Vite SPA
- `docs/multi-store-marketplace.md` - multi-store feature notes
- `docs/instacart-cart-parity.md` - multi-cart hub / drawer parity notes

## API

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/stores?zip=` | Store list for a canned zip (`10002`, `94107`, `60614`) |
| `GET` | `/api/products?store_id=&query=&limit=` | **Requires** `store_id` |
| `GET` | `/api/recommendations?store_id=` | Store-scoped deals |
| `POST` | `/api/checkout/session` | Stripe Checkout; optional `store_id` / `store_name` metadata |
| `GET` | `/api/checkout/session-status?session_id=` | Verify payment; returns `store_id` from session metadata |

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

## Run with Docker + Datadog

Runs the backend (FastAPI, APM-instrumented via `ddtrace`), the frontend (built and served by nginx), and the Datadog Agent, which collects traces, container logs, and metrics.

1. Set your Datadog credentials in `.env`:

```bash
DD_API_KEY=<your-datadog-api-key>   # https://app.datadoghq.com/organization-settings/api-keys
DD_SITE=datadoghq.com               # match your Datadog region
```

2. Build and start:

```bash
docker compose up --build -d
```

3. Open the app at `http://localhost:8081` (backend API at `http://localhost:8001`). Click around to generate traffic, then view telemetry in Datadog:

- APM traces: service `marketplace-backend`, env `local`
- Container logs and metrics under the Infrastructure / Logs sections

> Native local (Vite `5173` + API `8000`) can run beside Docker. Docker publishes **8001** (API) and **8081** (UI) so the ports do not collide.

4. Stop everything:

```bash
docker compose down
```

## Run on Kubernetes (kind) + Datadog

Deploys the same app to a local `kind` cluster with the Datadog Operator, real
resource requests/limits, liveness/readiness probes, an HPA, and metrics-server.
Requires `docker`, `kind`, `kubectl`, and `helm`.

1. Set `DD_API_KEY` and `DD_SITE` in `.env` (same as above).

2. Bring everything up (builds images, creates the cluster, loads images,
   installs Datadog + metrics-server, deploys the app):

```bash
./k8s/deploy.sh
```

3. Open `http://localhost:8080` (backend API at `http://localhost:8000`). Then in Datadog:

- APM: service `marketplace-backend`, env `local`
- Infrastructure > Kubernetes: pod/container resource utilization vs. requests
- Logs: `marketplace-backend` / `marketplace-frontend`

4. Inspect and tear down:

```bash
kubectl -n marketplace get pods
kubectl -n marketplace top pods      # requests-vs-usage for right-sizing
./k8s/teardown.sh
```

Manifests live in `k8s/`. The backend's `resources` are intentionally generous
so observed utilization can drive a right-sizing change.

## API (quick reference)

See the API table near the top of this README for the full multi-store endpoints.
