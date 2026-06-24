# FreshCart test suites

QA test assets, organized by layer. Each layer has a `.cursor/rules` file that
encodes the team's conventions so AI-authored tests match house style.

| Layer | Location | Framework | Conventions |
|---|---|---|---|
| E2E | `tests/e2e/` | Playwright | `.cursor/rules/e2e-playwright.mdc` |
| Integration (API) | `tests/integration/` | Cucumber/Gherkin + Rest Assured | `.cursor/rules/integration-gherkin.mdc` |
| Unit | `backend/tests/` | Pytest | `.cursor/rules/unit-pytest.mdc` |
| Performance | `tests/perf/` | k6 | — |

Test cases trace back to Azure DevOps work items and the **Discount Codes - QA**
test plan in the `Marketplace` ADO project. Code lives in GitHub; work items and
test plans live in ADO.

## Running

Unit (no server needed):

```bash
cd backend && source .venv/bin/activate && pytest
```

E2E (needs the app running on 5173/8000 — use the `start-ecommerce-services` skill):

```bash
cd tests/e2e && npm install && npx playwright install && npm test
# against staging: BASE_URL=https://staging.example.com npm test
```

Integration (needs JDK 17 + Maven and the API running):

```bash
cd tests/integration && mvn test -Dapi.baseUri=http://127.0.0.1:8000
```

Performance (needs k6):

```bash
k6 run tests/perf/browse-load.js
```
