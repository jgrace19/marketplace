---
name: sre-scan
description: >-
  Scan the current branch's changes for reliability, resiliency, and
  operability issues before they reach production, applying SRE best practices.
  Use when the user asks for an SRE scan, SRE review, reliability review,
  resiliency check, production-readiness check, or wants to find SRE issues
  introduced by branch or PR changes.
disable-model-invocation: true
---

# SRE Scan

Review the code introduced on the current branch (vs. the default branch) for
SRE risks: failure modes, resource sizing, observability gaps, and operational
hazards. Report findings by severity with concrete fixes. This is a review, not
an automatic rewrite — do not change code unless the user asks.

## Scope

Scan **only what the branch changed** plus the immediate blast radius of those
changes. Do not audit the whole repo.

## Workflow

### Step 1: Establish the diff

Find the merge base against the default branch and collect the changes.

```bash
git branch --show-current
BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
git diff --stat "$BASE"...HEAD
git diff "$BASE"...HEAD
```

If `origin/main` and `main` both fail, ask the user for the base branch. If the
working tree has uncommitted changes relevant to the review, include
`git diff HEAD` as well and note that they are uncommitted.

Record the changed files, grouped by role: application code, config/manifests
(Docker, Kubernetes, Helm, Terraform), CI/CD, and dependencies.

### Step 2: Analyze changes against the SRE checklist

For each changed file, evaluate the categories below. Only raise a finding when
the branch **introduced or worsened** the issue — pre-existing problems in
untouched code are out of scope (mention them separately only if directly
relevant to a changed line).

See [checklist.md](checklist.md) for the full category-by-category detail. The
high-signal categories:

1. **Failure handling** — new external calls, I/O, or dependencies without
   timeouts, retries (with backoff + jitter), circuit breakers, or error
   handling. Unhandled exceptions that become 5xx. Broad `except`/swallowed
   errors. Missing input validation at trust boundaries.
2. **Resource sizing** — containers/pods with no CPU/memory requests or limits,
   or values that don't match the workload. Missing/incorrect autoscaling
   (HPA) targets. Unbounded concurrency, connection pools, queues, or caches.
3. **Blocking & latency** — blocking/synchronous I/O on hot paths (esp. in
   async frameworks), N+1 calls, missing pagination/limits, work done in
   request path that belongs in a background job.
4. **Observability** — new endpoints or code paths with no logging, metrics, or
   tracing. Errors logged without context/correlation IDs. New failure modes
   with no signal for a monitor to alert on. Missing health/readiness checks.
5. **Rollout & recovery** — no health/readiness/liveness probes on new
   services. Non-idempotent operations that can't be safely retried. Schema or
   API changes without backward compatibility / migration story. Missing
   graceful shutdown.
6. **Configuration & secrets** — hardcoded timeouts/URLs/credentials, secrets in
   code or committed env files, overly broad CORS/network policy, config that
   can't be changed without a redeploy.
7. **Capacity & load** — changes that multiply downstream load, remove rate
   limiting, or introduce retry storms / thundering herds.

### Step 3: Assess severity

Assign each finding a severity:

| Severity | Meaning | Examples |
|---|---|---|
| Critical | Will cause an outage, data loss, or cascading failure under normal or peak load | Unhandled 500 on a user path, retry storm, no limits on a service that can OOM the node |
| High | Likely to cause incidents or degrade reliability; no safe rollback | Blocking external call with no timeout on hot path, missing health probes, breaking API change |
| Medium | Increases risk or slows incident response | No metrics/logs on a new path, missing autoscaling, unbounded cache |
| Low | Best-practice gap, minor operability improvement | Hardcoded config that should be env-driven, missing correlation ID |

When unsure, err one level higher and state the assumption.

### Step 4: Report findings

Use the template in [report-template.md](report-template.md). For each finding
include: severity, file/line, what the change introduced, why it's a risk (the
failure mode), and a concrete fix. Reference exact lines using the
`startLine:endLine:filepath` code-reference format.

If the branch has no SRE issues, say so explicitly and list what you checked.

### Step 5: Offer next steps

After reporting, offer (do not perform unless asked):
- Apply the recommended fixes.
- Add a Datadog monitor / SLO for any new failure mode found (this repo ships a
  Datadog pipeline — see the Datadog MCP for creating monitors/dashboards).
- Add tests covering the new failure paths.

## Notes for this repo

This is a FastAPI backend + React/Vite frontend deployed via Docker Compose and
a local `kind` Kubernetes cluster, wired to Datadog APM/logs. Common SRE gaps to
watch for in changes here:
- Backend does **blocking** outbound HTTP (`requests.get`) to external sites on
  request paths — new external calls should have timeouts and error handling.
- `docker-compose.yml` services and K8s Deployments need CPU/memory
  requests/limits and health probes on `/api/health`.
- New backend endpoints should have error handling so they don't emit unhandled
  500s, and should be observable in Datadog APM.
- CORS is env-driven; watch for changes that widen it to `*`.
