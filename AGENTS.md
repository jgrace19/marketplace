# AGENTS.md

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Backend (FastAPI) | `cd backend && uvicorn main:app --reload --port 8000` | 8000 | Serves `/api/health`, `/api/products`, `/api/checkout/session` |
| Frontend (Vite + React) | `cd frontend && npm run dev` | 5173 | SPA at `http://localhost:5173` |

### Caveats

- `uvicorn` installs to `~/.local/bin` which may not be on `PATH`. Either use `python3 -m uvicorn main:app --reload --port 8000` or prepend `export PATH="$HOME/.local/bin:$PATH"`.
- The backend attempts to scrape Amazon for products. In network-restricted environments (including Cloud Agent VMs), it falls back to 32 hardcoded grocery items automatically — this is expected behavior, not a bug.
- Stripe checkout requires `STRIPE_SECRET_KEY` env var. Product browsing, search, cart, and profile all work without it.
- The frontend connects to the backend at `http://127.0.0.1:8000` (hardcoded in `frontend/src/App.jsx`).
- No database, cache, or external service is required to run the app.
- No linter or test framework is configured in this repo. `npm run build` (Vite) is the closest build-verification step for the frontend.

### Quick verification

```bash
# Backend health check
curl http://127.0.0.1:8000/api/health
# Products API
curl "http://127.0.0.1:8000/api/products?limit=3"
# Frontend HTML
curl http://localhost:5173/
```
