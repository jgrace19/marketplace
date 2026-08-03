# Datadog monitoring

APM error-rate monitor for `marketplace-backend` (`env:local`). It is the
trigger point for a Cursor remediation automation.

> **Note:** An older demo intentionally made `GET /api/recommendations` raise
> `ZeroDivisionError`. Multi-store marketplace removed that bug — Today's Deals
> now returns store-scoped deals successfully. The monitor still watches service
> error spans; fire it with a real failure path or a temporary fault injection.

## Apply it

You need a Datadog **Application key** in addition to the API key. Add to `.env`:

```bash
DD_APP_KEY=<your-datadog-application-key>   # https://app.datadoghq.com/organization-settings/application-keys
```

Then either:

- **API / curl:** `./monitoring/apply-monitor.sh`
- **Terraform:** `cd monitoring && terraform init && \
    DATADOG_API_KEY=$DD_API_KEY DATADOG_APP_KEY=$DD_APP_KEY \
    DATADOG_HOST=https://api.us5.datadoghq.com terraform apply`

## Monitor logic

- **Query:** `sum(last_5m):sum:trace.fastapi.request.errors{service:marketplace-backend,env:local}.as_count() > 5`
- **Critical:** > 5 errors / 5 min, **Warning:** >= 1
- Optionally scope with `resource_name:...` once you confirm the tag in APM Errors.

## Generate healthy traffic (smoke)

```bash
# Docker local API (port 8001)
for i in $(seq 1 10); do
  curl -s -o /dev/null "http://127.0.0.1:8001/api/recommendations?store_id=greenmart"
done
```

(Use `8000` for the native local API.)

This confirms APM traces for the recommendations endpoint; it will **not** trip
the error-rate monitor unless the endpoint is failing.

> Note: a brand-new service takes a few minutes to appear in the APM service
> catalog before the monitor can evaluate its metrics.
