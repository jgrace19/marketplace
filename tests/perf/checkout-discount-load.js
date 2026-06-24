import http from "k6/http";
import { check, sleep } from "k6";

// Load profile for the discount-validation hot path on the checkout flow.
// Run: k6 run tests/perf/checkout-discount-load.js   (override with -e BASE_URL=...)
const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8000";

export const options = {
  scenarios: {
    discount_validation: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 30 },
        { duration: "1m", target: 30 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:discount}": ["p(95)<400"],
  },
};

const codes = ["SAVE10", "5OFF", "WELCOME100", "BIGSPEND"];

export default function () {
  const code = codes[Math.floor(Math.random() * codes.length)];
  const res = http.post(
    `${BASE_URL}/api/discount/validate`,
    JSON.stringify({ code, subtotal: 120.0 }),
    { headers: { "Content-Type": "application/json" }, tags: { endpoint: "discount" } }
  );

  check(res, {
    "discount: status is 200": (r) => r.status === 200,
    "discount: returns a new_total": (r) => JSON.parse(r.body).new_total !== undefined,
  });

  sleep(1);
}
