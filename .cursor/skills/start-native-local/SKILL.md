---
name: start-native-local
description: Starts FreshCart natively on the host (FastAPI uvicorn --reload on :8000 and Vite on :5173), including venv/npm setup. Use when the user asks to start native local, run locally without Docker, boot host dev servers, or run side by side with Docker.
disable-model-invocation: true
---

# Start Native Local

Run FreshCart on the host (not Docker).

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://127.0.0.1:5173 |
| Backend (uvicorn --reload) | http://127.0.0.1:8000 |

Docker uses **8001** / **8081** — native and Docker can run together.

## Workflow

### 1) Layout

Confirm `backend/` and `frontend/` exist. Stop if missing.

### 2) Backend setup (`backend/`)

1. Create `.venv` if missing: `python3 -m venv .venv`
2. Install deps: `source .venv/bin/activate && pip install -r requirements.txt`

### 3) Frontend setup (`frontend/`)

1. If `node_modules/` missing: `npm install`

### 4) Port check

If something other than this stack already owns **8000** or **5173**, stop and report it (do not kill Docker on 8001/8081).

### 5) Start (background OK)

- Backend (`backend/`): `source .venv/bin/activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000`
- Frontend (`frontend/`): `npm run dev -- --host 127.0.0.1 --port 5173`

### 6) Verify

```bash
curl -fsS http://127.0.0.1:8000/api/health
curl -fsS 'http://127.0.0.1:8000/api/stores?zip=10002' | head -c 200
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/
```

Expect health `{"status":"ok"}`, a stores JSON payload, and frontend `200`.

## Output

Report:

1. Backend status + URL  
2. Frontend status + URL  
3. Setup steps performed  
4. Reminder: Docker UI/API stay on 8081/8001 if also running  
