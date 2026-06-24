import http from "k6/http";
import { check, sleep } from "k6";

// Representative k6 load profile for the read-heavy browse path.
// Run: k6 run tests/perf/browse-load.js   (override host with -e BASE_URL=...)
const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8000";

export const options = {
  stages: [
    { duration: "30s", target: 20 }, // ramp up
    { duration: "1m", target: 20 }, // steady state
    { duration: "20s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const list = http.get(`${BASE_URL}/api/products`);
  check(list, {
    "products: status is 200": (r) => r.status === 200,
    "products: returns items": (r) => JSON.parse(r.body).count > 0,
  });

  const search = http.get(`${BASE_URL}/api/products?query=milk`);
  check(search, { "search: status is 200": (r) => r.status === 200 });

  sleep(1);
}
