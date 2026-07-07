# SRE Scan Checklist

Detailed detection guidance per category. For each changed line, ask "what new
failure mode does this create, and how would we survive it in production?"

## 1. Failure handling

- **External calls / I/O without timeouts.** Any new network call, DB query,
  file, or subprocess must have a bounded timeout. Default/library timeouts are
  often infinite. In this repo watch for `requests.get/post` without `timeout=`.
- **No retries or bad retries.** Transient-failure-prone calls should retry with
  exponential backoff + jitter and a cap. Flag retries with no backoff, no cap,
  or retries on non-idempotent writes.
- **No circuit breaker / fallback.** A hard dependency with no fallback becomes a
  single point of failure. Flag when a new dependency has no degraded path.
- **Unhandled exceptions → 5xx.** New endpoints/handlers that can raise
  (division, index/key errors, parsing, None access, external failure) with no
  try/except or validation. These become user-facing 500s.
- **Swallowed errors.** Bare `except:` / `except Exception: pass`, catching then
  ignoring, or returning success on failure. Hides incidents.
- **Missing input validation.** Untrusted input used without validation at trust
  boundaries (query params, request bodies, headers, uploads).

## 2. Resource sizing

- **No requests/limits.** New/changed containers (Dockerfile, compose) or pods
  (Deployment, StatefulSet) with no CPU/memory `requests` and `limits`. No
  limits risks node OOM and noisy-neighbor failures; no requests breaks
  scheduling and right-sizing.
- **Mis-sized values.** Limits far above/below realistic use; memory limit with
  no headroom (OOMKill risk); CPU limit that will throttle latency-sensitive
  work.
- **Autoscaling gaps.** New scalable workload with no HPA, or HPA targeting the
  wrong signal / unrealistic thresholds / missing min-max bounds.
- **Unbounded resources.** Caches, queues, connection pools, thread pools, or
  in-memory collections that grow without limit → memory leak / exhaustion.

## 3. Blocking & latency

- **Blocking I/O on hot paths.** Synchronous/blocking calls inside async request
  handlers (FastAPI `def` vs `async def` doing blocking work in the event loop),
  or heavy CPU work in the request path.
- **N+1 / fan-out.** Loops issuing per-item network or DB calls.
- **Missing pagination/limits.** Endpoints returning unbounded result sets.
- **Work that belongs in the background.** Long-running work (scraping, email,
  report generation) done synchronously in the request path.

## 4. Observability

- **No logs/metrics/traces on new paths.** New endpoints or branches with no way
  to see success/failure rate, latency, or errors.
- **Low-context errors.** Errors logged without correlation/request IDs, user
  context, or the failing input — slows incident response.
- **No signal to alert on.** A new failure mode with nothing a monitor could key
  off (status code, custom metric, log pattern).
- **Missing health/readiness endpoints** for a new service.

## 5. Rollout & recovery

- **No probes.** New services/Deployments without liveness/readiness/startup
  probes → bad rollouts, traffic to unready pods.
- **Non-idempotent + retried.** Operations that double-charge/double-write if
  retried, with no idempotency key.
- **Breaking API/schema changes.** Removed/renamed fields, changed types, or
  narrowed contracts with no versioning or backward compatibility → breaks
  consumers during rollout.
- **DB migrations.** Destructive or non-backward-compatible migrations that
  aren't safe across a rolling deploy.
- **No graceful shutdown.** In-flight requests dropped on SIGTERM; missing
  `terminationGracePeriod` handling.

## 6. Configuration & secrets

- **Hardcoded config.** Timeouts, URLs, hostnames, feature toggles baked into
  code instead of env/config — can't change without redeploy.
- **Secrets in code / VCS.** API keys, tokens, passwords in source or committed
  `.env` / manifests.
- **Overly broad access.** CORS `*`, `0.0.0.0` binds where inappropriate, wide
  network policies, permissive IAM.

## 7. Capacity & load

- **Load multipliers.** Changes that increase requests to a downstream service
  (added polling, removed cache, chattier client).
- **Retry storms / thundering herd.** Synchronized retries or cache-stampede
  patterns with no jitter or backoff.
- **Removed rate limiting / backpressure.** Dropped throttles or queue bounds.
