# Datadog monitor for the marketplace-backend demo.
# Requires the Datadog Terraform provider and DD_API_KEY / DD_APP_KEY env vars.
#
#   terraform init
#   DATADOG_API_KEY=... DATADOG_APP_KEY=... DATADOG_HOST=https://api.us5.datadoghq.com \
#     terraform apply

terraform {
  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.0"
    }
  }
}

provider "datadog" {}

resource "datadog_monitor" "recommendations_errors" {
  name = "[marketplace-backend] High error rate on /api/recommendations"
  type = "query alert"

  # APM error spans for the service. Add resource_name:get_/api/recommendations
  # to scope strictly to the buggy endpoint once you confirm the tag value.
  query = "sum(last_5m):sum:trace.fastapi.request.errors{service:marketplace-backend,env:local}.as_count() > 5"

  message = <<-EOT
    {{#is_alert}}
    marketplace-backend is returning 5xx errors from APM error spans.
    This is almost certainly a code-level exception (check the service's Errors
    tab for the top stack trace).

    Runbook:
    1. Open the failing trace and note the file:line in the stack.
    2. Confirm blast radius (which resource_name is erroring).
    3. Trigger the Cursor remediation automation to open a fix PR.
    {{/is_alert}}
    {{#is_recovery}}
    marketplace-backend error rate has recovered.
    {{/is_recovery}}
  EOT

  monitor_thresholds {
    critical = 5
    warning  = 1
  }

  notify_no_data    = false
  renotify_interval = 0
  include_tags      = true

  tags = ["service:marketplace-backend", "env:local", "team:sre", "demo:cursor"]
}
