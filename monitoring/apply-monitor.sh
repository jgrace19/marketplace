#!/usr/bin/env bash
# Create/update the marketplace-backend error monitor via the Datadog API.
# Requires DD_API_KEY and DD_APP_KEY (Application key) in .env.
#   https://app.datadoghq.com/organization-settings/application-keys
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

: "${DD_API_KEY:?Set DD_API_KEY in .env}"
: "${DD_APP_KEY:?Set DD_APP_KEY (Datadog Application key) in .env}"
DD_SITE="${DD_SITE:-us5.datadoghq.com}"

echo "==> Creating monitor on https://api.${DD_SITE}"
curl -sS -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -H "Content-Type: application/json" \
  -d @"$REPO_ROOT/monitoring/monitor.json" | tee /tmp/dd-monitor-resp.json
echo
echo "==> Monitor id:"
grep -o '"id":[0-9]*' /tmp/dd-monitor-resp.json | head -1 || true
