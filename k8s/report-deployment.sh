#!/usr/bin/env bash
# Report a deploy to Cursor Rollouts. Never fails the deploy: every path exits 0.
#
# Usage (env: CURSOR_API_KEY, CHANGE_MONITOR_ENV, CHANGE_MONITOR_SERVICE):
#   report-deployment.sh bootstrap
#   DEPLOY_VERSION=<sha> CHANGE_MONITOR_ACTOR=<id> report-deployment.sh start   # prints deployment name
#   CHANGE_MONITOR_DEPLOYMENT=<name> CHANGE_MONITOR_ACTOR=<id> \
#     report-deployment.sh finish succeeded|failed|aborted [message]
set -u

API="https://api.cursor.com/factory.v1.DeploymentsService"
DEPLOY_SOURCE_URI="https://github.com/jgrace19/marketplace"
# Secrets go to curl via stdin (-H @-) so they never appear in the process list.
CURL_TIMEOUTS=(--connect-timeout 5 --max-time 15)

report_rollouts_auth_failure() {
  message="$1"
  echo "Rollouts reporter: ${message}" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error title=Rollouts reporter::${message}" >&2
  fi
  if [ -n "${BUILDKITE:-}" ] && command -v buildkite-agent >/dev/null 2>&1; then
    buildkite-agent annotate --style error --context rollouts-reporter "${message}" || true
  fi
}
rollouts_stop_file="$(mktemp)"
rollouts_halt() {
  echo stopped > "$rollouts_stop_file"
  return 0
}
if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "Rollouts reporter: curl and jq are required, deploy not reported" >&2
  rollouts_halt
fi
if [ ! -s "$rollouts_stop_file" ] && [ -z "${CURSOR_API_KEY:-}" ]; then
  report_rollouts_auth_failure "CURSOR_API_KEY is missing. Create a team API key at https://cursor.com/dashboard/api-keys and set CURSOR_API_KEY in .env (or the CURSOR_API_KEY secret in CI). The deploy continues."
  rollouts_halt
fi
rollouts_exchange() {
  if [ -s "$rollouts_stop_file" ]; then
    return 0
  fi
  exchange_body="$(mktemp)"
  exchange_status="$(printf 'Authorization: Bearer %s\n' "$CURSOR_API_KEY" | \
    curl -sS "${CURL_TIMEOUTS[@]}" -o "$exchange_body" -w "%{http_code}" -X POST https://api2.cursor.sh/auth/exchange_user_api_key \
    -H @- -H "Content-Type: application/json" -d '{}')" || {
    echo "Rollouts reporter: Rollouts API unavailable, deploy not reported" >&2
    rollouts_halt
    return 0
  }
  case "$exchange_status" in
    401|403)
      report_rollouts_auth_failure "CURSOR_API_KEY was rejected (HTTP ${exchange_status}) by the token exchange. Replace CURSOR_API_KEY with a team API key from https://cursor.com/dashboard/api-keys. A personal key or a key with no team access is rejected. The deploy continues."
      rollouts_halt
      return 0
      ;;
    2*)
      ;;
    *)
      echo "Rollouts reporter: Rollouts API unavailable, deploy not reported" >&2
      rollouts_halt
      return 0
      ;;
  esac
  TOKEN="$(jq -r '.accessToken // empty' "$exchange_body" 2>/dev/null || true)"
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "Rollouts reporter: Rollouts API unavailable, deploy not reported" >&2
    rollouts_halt
    return 0
  fi
}
rollouts_post() {
  if [ -s "$rollouts_stop_file" ]; then
    return 0
  fi
  call="$1"
  url="$2"
  body="$3"
  allow409="${4:-}"
  response="$(mktemp)"
  status="$(printf 'Authorization: Bearer %s\n' "$TOKEN" | \
    curl -sS "${CURL_TIMEOUTS[@]}" -o "$response" -w "%{http_code}" -X POST "$url" \
    -H @- -H "Content-Type: application/json" -H "Connect-Protocol-Version: 1" \
    -d "$body")" || {
    echo "Rollouts reporter: ${call} failed before a response. The deploy continues." >&2
    rollouts_halt
    return 0
  }
  case "$status" in
    401|403)
      report_rollouts_auth_failure "CURSOR_API_KEY was rejected (HTTP ${status}) by ${call}. Replace CURSOR_API_KEY with a team API key from https://cursor.com/dashboard/api-keys. A personal key or a key with no team access is rejected. The deploy continues."
      rollouts_halt
      return 0
      ;;
  esac
  if [ "$status" = "409" ] && [ "$allow409" = "allow409" ]; then
    return 0
  fi
  if [ "$status" -ge 400 ]; then
    echo "Rollouts reporter: ${call} returned HTTP ${status}. The deploy continues." >&2
    rollouts_halt
    return 0
  fi
  cat "$response"
}

require() {
  if [ ! -s "$rollouts_stop_file" ] && [ -z "${!1:-}" ]; then
    echo "Rollouts reporter: $1 is not set, deploy not reported" >&2
    rollouts_halt
  fi
}

cmd_bootstrap() {
  require CHANGE_MONITOR_ENV
  require CHANGE_MONITOR_SERVICE
  rollouts_exchange
  [ -s "$rollouts_stop_file" ] && return 0
  rollouts_post CreateEnvironment "$API/CreateEnvironment" \
    "$(jq -nc --arg env "$CHANGE_MONITOR_ENV" '{environmentId:$env,environment:{displayName:$env}}' || true)" allow409 >/dev/null
  rollouts_post CreateService "$API/CreateService" \
    "$(jq -nc --arg service "$CHANGE_MONITOR_SERVICE" '{serviceId:$service,service:{displayName:$service}}' || true)" allow409 >/dev/null
}

cmd_start() {
  require CHANGE_MONITOR_ENV
  require CHANGE_MONITOR_SERVICE
  require DEPLOY_VERSION
  require CHANGE_MONITOR_ACTOR
  rollouts_exchange
  deployment_body="$(mktemp)"
  rollouts_body=""
  if [ ! -s "$rollouts_stop_file" ]; then
    rollouts_body="$(jq -nc \
      --arg source "$DEPLOY_SOURCE_URI" \
      --arg env "$CHANGE_MONITOR_ENV" \
      --arg version "$DEPLOY_VERSION" \
      --arg service "$CHANGE_MONITOR_SERVICE" \
      --arg actor "$CHANGE_MONITOR_ACTOR" \
      '{deployment:{deploySourceUri:$source,environment:("environments/"+$env),deployVersion:$version,service:("services/"+$service)},event:{started:{},actor:$actor}}' || true)"
    if [ -z "$rollouts_body" ] || [ "$rollouts_body" = "null" ]; then
      echo "Rollouts reporter: Rollouts API unavailable, deploy not reported" >&2
      rollouts_halt
    fi
  fi
  rollouts_post CreateDeployment "$API/CreateDeployment" "$rollouts_body" > "$deployment_body"
  DEPLOYMENT="$(jq -r '.deployment.name // empty' "$deployment_body" 2>/dev/null || true)"
  if [ ! -s "$rollouts_stop_file" ] && { [ -z "$DEPLOYMENT" ] || [ "$DEPLOYMENT" = "null" ]; }; then
    echo "Rollouts reporter: Rollouts API unavailable, deploy not reported" >&2
    rollouts_halt
  fi
  [ -s "$rollouts_stop_file" ] || echo "$DEPLOYMENT"
}

cmd_finish() {
  outcome="${1:-}"
  message="${2:-deploy failed}"
  if [ -z "${CHANGE_MONITOR_DEPLOYMENT:-}" ]; then
    return 0
  fi
  require CHANGE_MONITOR_ACTOR
  case "$outcome" in
    succeeded) event='{completed:{succeeded:{}},actor:$actor}' ;;
    failed) event='{completed:{failed:{message:$message}},actor:$actor}' ;;
    aborted) event='{aborted:{},actor:$actor}' ;;
    *)
      echo "Rollouts reporter: unknown outcome '${outcome}', deploy not reported" >&2
      return 0
      ;;
  esac
  rollouts_exchange
  rollouts_body=""
  if [ ! -s "$rollouts_stop_file" ]; then
    rollouts_body="$(jq -nc \
      --arg name "$CHANGE_MONITOR_DEPLOYMENT" \
      --arg actor "${CHANGE_MONITOR_ACTOR:-}" \
      --arg message "$message" \
      "{name:\$name,event:${event}}" || true)"
    if [ -z "$rollouts_body" ] || [ "$rollouts_body" = "null" ]; then
      echo "Rollouts reporter: Rollouts API unavailable, deploy not reported" >&2
      rollouts_halt
    fi
  fi
  rollouts_post AppendDeploymentEvent "$API/AppendDeploymentEvent" "$rollouts_body" >/dev/null
}

case "${1:-}" in
  bootstrap) cmd_bootstrap ;;
  start) cmd_start ;;
  finish) shift; cmd_finish "$@" ;;
  *) echo "Rollouts reporter: usage: $0 bootstrap|start|finish <outcome> [message]" >&2 ;;
esac
exit 0
