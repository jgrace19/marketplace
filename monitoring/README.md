# Datadog monitoring

Monitor that catches 5xx responses from `GET /api/recommendations`. It alerts
on APM error spans for the `marketplace-backend` service and is the trigger
point for a Cursor remediation automation.

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
- Scope to the endpoint by adding `resource_name:get_/api/recommendations` to the
  query once you confirm the tag value in the APM Errors tab.

## Generate validation traffic

Click **Today's Deals** in the app, or curl the endpoint to send healthy traffic
through the monitored resource:

```bash
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8000/api/recommendations; done
```

The endpoint should return 200 for these requests. To test the alert itself,
use a non-production fault-injection change or an isolated failing route so the
demo app does not depend on a known 500 response.

> Note: a brand-new service takes a few minutes to appear in the APM service
> catalog before the monitor can evaluate its metrics.
