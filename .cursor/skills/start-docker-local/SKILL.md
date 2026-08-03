---
name: start-docker-local
description: Starts FreshCart via Docker Compose on ports 8001/8081 with the Datadog agent, rebuilds images, and validates that logs reach Datadog. Use when the user asks to start Docker local, docker compose up, run the containerized stack, or verify Datadog logs.
disable-model-invocation: true
---

# Start Docker Local

Run the containerized stack **beside** native local (native keeps 8000/5173).

| Service | URL |
|---------|-----|
| Frontend (nginx) | http://localhost:8081 |
| Backend (API) | http://127.0.0.1:8001 |
| Datadog agent APM | localhost:8126 |

## Workflow

### 1) Prerequisites

- `docker` and `docker compose` available
- Repo root `.env` has `DD_API_KEY` and `DD_SITE` (required by compose)
- Prefer also `DD_APP_KEY` for end-to-end Logs API validation

If `DD_API_KEY` is missing, stop and tell the user to set it in `.env`.

### 2) Start / rebuild

From repo root:

```bash
docker compose up --build -d
```

Wait until `backend`, `frontend`, and `datadog-agent` are running:

```bash
docker compose ps
```

### 3) Smoke the app

```bash
curl -fsS http://127.0.0.1:8001/api/health
curl -fsS 'http://127.0.0.1:8001/api/stores?zip=10002' | head -c 200
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/
```

Expect health OK, stores JSON (proves `stores.py` is in the image), frontend `200`.

### 4) Datadog log validation (required)

Run the skill script (executable):

```bash
bash .cursor/skills/start-docker-local/scripts/validate-datadog-logs.sh
```

The script:

1. Confirms `datadog-agent` + `backend` containers are running  
2. Checks `agent status` for a running **Logs Agent**  
3. Generates traffic against `:8001`  
4. Confirms recent lines in `docker logs marketplace-backend`  
5. If `DD_APP_KEY` is set, queries the Datadog Logs API for `service:marketplace-backend env:local`  

**Do not report success if step 4 fails.** If Logs API returns empty, wait ~1–2 minutes and re-run once; still empty → report failure with next fixes (API key/site, app key, agent logs).

### 5) Optional APM sanity

```bash
docker exec marketplace-datadog-agent agent status | grep -A15 -i "APM Agent"
```

## Output

Report:

1. Compose status (services up / build notes)  
2. App URLs (8081 / 8001)  
3. Datadog validation result (pass/fail + which checks)  
4. Note that native local can still use 5173 / 8000  

## Port map (do not collide with native)

| Stack | Frontend | Backend |
|-------|----------|---------|
| Native | 5173 | 8000 |
| Docker | 8081 | 8001 |
