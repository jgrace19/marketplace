---
name: start-ecommerce-services
description: Starts the local FastAPI backend and React Vite frontend for this ecommerce project, including first-run setup checks for Python venv, pip dependencies, and npm dependencies. Use when the user asks to start, boot, run, or launch the app/services/dev servers.
disable-model-invocation: true
---

# Start Ecommerce Services

## Instructions

Use this skill to start both services for this repository:

- Backend: FastAPI on `http://127.0.0.1:8000`
- Frontend: Vite on `http://localhost:5173`

Follow this workflow.

### 1) Validate project layout

Confirm these directories exist:

- `backend/`
- `frontend/`

If either is missing, stop and report the blocker.

### 2) Backend setup check

In `backend/`:

1. If `.venv/` is missing, create it with:
   - `python3 -m venv .venv`
2. Ensure dependencies are installed:
   - `source .venv/bin/activate && pip install -r requirements.txt`

### 3) Frontend setup check

In `frontend/`:

1. If `node_modules/` is missing, run:
   - `npm install`

### 4) Start services

Start both services (background tasks are acceptable):

- Backend command (in `backend/`):
  - `source .venv/bin/activate && uvicorn main:app --reload --port 8000`
- Frontend command (in `frontend/`):
  - `npm run dev`

### 5) Verify startup

Confirm both services started successfully by checking command output for:

- Backend: Uvicorn startup message on port `8000`
- Frontend: Vite local URL on port `5173`

If startup fails, report the exact command and error output, then suggest the next fix.

## Output format

When finished, respond with:

1. Backend status (running/failed)
2. Frontend status (running/failed)
3. URLs:
   - `http://127.0.0.1:8000`
   - `http://localhost:5173`
4. Any setup steps performed (venv created, installs run)
