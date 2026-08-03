#!/usr/bin/env bash
# Validate that the Docker Datadog agent is collecting logs and (optionally)
# that recent marketplace-backend logs appear in the Datadog Logs API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DD_SITE="${DD_SITE:-datadoghq.com}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8001}"
MARKER="dd-log-check-$(date +%s)"
FAILED=0

api_host_for_site() {
  case "$1" in
    datadoghq.com) echo "https://api.datadoghq.com" ;;
    datadoghq.eu) echo "https://api.datadoghq.eu" ;;
    us3.datadoghq.com) echo "https://api.us3.datadoghq.com" ;;
    us5.datadoghq.com) echo "https://api.us5.datadoghq.com" ;;
    ap1.datadoghq.com) echo "https://api.ap1.datadoghq.com" ;;
    ddog-gov.com) echo "https://api.ddog-gov.com" ;;
    *) echo "https://api.${1}" ;;
  esac
}

echo "==> Checking containers"
if ! docker compose ps --status running --services | grep -qx datadog-agent; then
  echo "FAIL: datadog-agent is not running"
  FAILED=1
else
  echo "OK: datadog-agent is running"
fi

if ! docker compose ps --status running --services | grep -qx backend; then
  echo "FAIL: backend is not running"
  FAILED=1
else
  echo "OK: backend is running"
fi

echo "==> Checking Datadog agent Logs Agent status"
STATUS="$(docker exec marketplace-datadog-agent agent status 2>/dev/null || true)"
if [[ -z "$STATUS" ]]; then
  echo "FAIL: could not read agent status (is the container healthy?)"
  FAILED=1
elif echo "$STATUS" | grep -qi "Logs Agent"; then
  if echo "$STATUS" | grep -A20 -i "Logs Agent" | grep -qiE "is running|Running"; then
    echo "OK: Logs Agent reports running"
  else
    echo "WARN: Logs Agent section present but running state unclear — inspect agent status"
    echo "$STATUS" | grep -A30 -i "Logs Agent" | head -n 40
  fi
else
  echo "FAIL: Logs Agent section missing from agent status (is DD_LOGS_ENABLED=true?)"
  FAILED=1
fi

echo "==> Generating backend traffic with marker: $MARKER"
curl -fsS -H "X-DD-Log-Check: $MARKER" "$BACKEND_URL/api/health" >/dev/null
curl -fsS "$BACKEND_URL/api/stores?zip=10002" >/dev/null
curl -fsS "$BACKEND_URL/api/products?store_id=greenmart" >/dev/null
echo "OK: traffic generated against $BACKEND_URL"

echo "==> Checking recent backend container logs locally"
if docker logs marketplace-backend --since 2m 2>&1 | grep -qE "GET /api/(health|stores|products)"; then
  echo "OK: backend container emitted recent access/log lines"
else
  echo "WARN: did not see recent request lines in docker logs (uvicorn may log differently)"
fi

if [[ -z "${DD_API_KEY:-}" ]]; then
  echo "FAIL: DD_API_KEY is not set — cannot confirm ship-to-Datadog"
  FAILED=1
elif [[ -z "${DD_APP_KEY:-}" ]]; then
  echo "WARN: DD_APP_KEY not set — skipping Datadog Logs API query"
  echo "      Agent-side checks passed above are the local proof path."
  echo "      Add DD_APP_KEY to .env for end-to-end Logs API validation."
else
  API_HOST="$(api_host_for_site "$DD_SITE")"
  FROM_TS=$(( $(date +%s) * 1000 - 10 * 60 * 1000 ))
  TO_TS=$(( $(date +%s) * 1000 ))
  echo "==> Querying Datadog Logs API at $API_HOST (last 10m)"
  # Give the agent a moment to flush.
  sleep 8
  BODY="$(curl -fsS -X POST "$API_HOST/api/v2/logs/events/search" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -H "DD-API-KEY: $DD_API_KEY" \
    -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    -d "{
      \"filter\": {
        \"from\": \"${FROM_TS}\",
        \"to\": \"${TO_TS}\",
        \"query\": \"service:marketplace-backend env:local\"
      },
      \"page\": { \"limit\": 5 },
      \"sort\": \"-timestamp\"
    }" || true)"

  if [[ -z "$BODY" ]]; then
    echo "FAIL: Logs API request failed (check DD_SITE / keys / network)"
    FAILED=1
  elif echo "$BODY" | grep -q '"data"[[:space:]]*:[[:space:]]*\[\]'; then
    echo "FAIL: Logs API returned 0 events for service:marketplace-backend env:local"
    echo "      Wait 1–2 minutes and re-run, or check Log Pipelines / container collect-all."
    FAILED=1
  elif echo "$BODY" | grep -q '"data"'; then
    COUNT="$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data') or []))" 2>/dev/null || echo "?")"
    echo "OK: Datadog Logs API returned $COUNT recent marketplace-backend event(s)"
  else
    echo "FAIL: unexpected Logs API response"
    echo "$BODY" | head -c 500
    echo
    FAILED=1
  fi
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo
  echo "Datadog log validation FAILED"
  exit 1
fi

echo
echo "Datadog log validation PASSED"
exit 0
