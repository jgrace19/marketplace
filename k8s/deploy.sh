#!/usr/bin/env bash
# Bring up the marketplace demo on a local kind cluster with Datadog.
# Usage: ./k8s/deploy.sh   (run from repo root or anywhere)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="$REPO_ROOT/k8s"
CLUSTER_NAME="marketplace"

# --- Load env (DD_API_KEY, DD_SITE, Stripe keys) ---
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi
: "${DD_API_KEY:?Set DD_API_KEY in .env}"
DD_SITE="${DD_SITE:-us5.datadoghq.com}"

echo "==> Building images"
docker build -t marketplace-backend:latest "$REPO_ROOT/backend"
docker build -t marketplace-frontend:latest \
  --build-arg VITE_API_BASE="${VITE_API_BASE:-http://127.0.0.1:8000}" \
  "$REPO_ROOT/frontend"

echo "==> Creating kind cluster (if missing)"
if ! kind get clusters | grep -qx "$CLUSTER_NAME"; then
  kind create cluster --config "$K8S_DIR/kind-cluster.yaml"
fi

echo "==> Loading images into kind"
kind load docker-image marketplace-backend:latest --name "$CLUSTER_NAME"
kind load docker-image marketplace-frontend:latest --name "$CLUSTER_NAME"

echo "==> Installing metrics-server (needed for kubectl top + HPA)"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# kind uses self-signed kubelet certs; allow insecure TLS for metrics-server.
kubectl patch -n kube-system deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' || true

echo "==> Installing Datadog Operator"
helm repo add datadog https://helm.datadoghq.com >/dev/null 2>&1 || true
helm repo update >/dev/null
kubectl create namespace datadog --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install datadog-operator datadog/datadog-operator -n datadog

echo "==> Creating Datadog API key secret"
kubectl create secret generic datadog-secret -n datadog \
  --from-literal=api-key="$DD_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Deploying Datadog Agent (site: $DD_SITE)"
sed "s|site: us5.datadoghq.com|site: $DD_SITE|" "$K8S_DIR/datadog-agent.yaml" | kubectl apply -f -

echo "==> Reporting deploy start to Cursor Rollouts"
REPORTER="$K8S_DIR/report-deployment.sh"
DEPLOY_ENV="local"
DEPLOY_VERSION="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
ROLLOUTS_RUN="k8s/deploy.sh:$(whoami)@$(hostname):$(date -u +%Y%m%dT%H%M%SZ)"
BACKEND_DEPLOYMENT=""
FRONTEND_DEPLOYMENT=""

rollouts_report() {
  local service="$1" deployment="$2"
  shift 2
  CHANGE_MONITOR_ENV="$DEPLOY_ENV" CHANGE_MONITOR_SERVICE="$service" \
    DEPLOY_VERSION="$DEPLOY_VERSION" CHANGE_MONITOR_DEPLOYMENT="$deployment" \
    CHANGE_MONITOR_ACTOR="$ROLLOUTS_RUN:$service:$DEPLOY_ENV" \
    "$REPORTER" "$@" || true
}

rollouts_close_open() {
  if [[ -n "$BACKEND_DEPLOYMENT" ]]; then
    rollouts_report marketplace-backend "$BACKEND_DEPLOYMENT" finish "$@"
    BACKEND_DEPLOYMENT=""
  fi
  if [[ -n "$FRONTEND_DEPLOYMENT" ]]; then
    rollouts_report marketplace-frontend "$FRONTEND_DEPLOYMENT" finish "$@"
    FRONTEND_DEPLOYMENT=""
  fi
}
trap 'status=$?; rollouts_close_open failed "k8s/deploy.sh exited with status $status"' EXIT
trap 'rollouts_close_open aborted; trap - EXIT; exit 130' INT TERM

rollouts_report marketplace-backend "" bootstrap
rollouts_report marketplace-frontend "" bootstrap
BACKEND_DEPLOYMENT="$(rollouts_report marketplace-backend "" start)"
FRONTEND_DEPLOYMENT="$(rollouts_report marketplace-frontend "" start)"

echo "==> Deploying app"
kubectl apply -f "$K8S_DIR/namespace.yaml"
kubectl create secret generic app-secrets -n marketplace \
  --from-literal=STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}" \
  --from-literal=STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$K8S_DIR/backend.yaml"
kubectl apply -f "$K8S_DIR/frontend.yaml"
kubectl apply -f "$K8S_DIR/backend-hpa.yaml"

echo "==> Waiting for rollouts"
ROLLOUT_FAILED=0
if kubectl -n marketplace rollout status deployment/backend --timeout=120s; then
  rollouts_report marketplace-backend "$BACKEND_DEPLOYMENT" finish succeeded
else
  ROLLOUT_FAILED=1
  rollouts_report marketplace-backend "$BACKEND_DEPLOYMENT" finish failed "rollout status deployment/backend did not complete"
fi
BACKEND_DEPLOYMENT=""
if kubectl -n marketplace rollout status deployment/frontend --timeout=120s; then
  rollouts_report marketplace-frontend "$FRONTEND_DEPLOYMENT" finish succeeded
else
  ROLLOUT_FAILED=1
  rollouts_report marketplace-frontend "$FRONTEND_DEPLOYMENT" finish failed "rollout status deployment/frontend did not complete"
fi
FRONTEND_DEPLOYMENT=""
if [[ "$ROLLOUT_FAILED" -ne 0 ]]; then
  exit 1
fi

cat <<EOF

Done.
  Frontend: http://localhost:8080
  Backend:  http://localhost:8000/api/health

Useful:
  kubectl -n marketplace get pods
  kubectl -n marketplace top pods          # requires metrics-server ready
  kubectl -n datadog get pods
EOF
