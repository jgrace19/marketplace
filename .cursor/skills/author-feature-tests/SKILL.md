---
name: author-feature-tests
description: Author a full test suite (data matrix + E2E, integration, unit, and performance tests) for a new or updated feature, following team rules and tracing back to the ADO work item. Use when a feature needs test coverage across layers.
---

# Author Feature Tests

Use this when a new or updated feature needs a full test suite.

## Steps

1. Read the linked Azure DevOps acceptance criteria (project `Marketplace`).
   If given a work item id, fetch it; otherwise ask which work item this covers.
2. Generate a test-data matrix: valid, invalid, boundary, and negative cases.
   Output as a table suitable for the ADO test plan ("Discount Codes - QA" or the
   feature's plan). Save it under `docs/` as the test-plan doc for the feature.
3. Author tests in each layer, following team rules:
   - E2E: Playwright in `tests/e2e/`, per `.cursor/rules/e2e-playwright.mdc`
     (Page Object Model, `data-testid` selectors, shared fixtures, no hard waits).
   - Integration: Gherkin feature + Rest Assured steps in `tests/integration/`,
     per `.cursor/rules/integration-gherkin.mdc`.
   - Unit: Pytest in `backend/tests/` with `parametrize` over the data matrix,
     per `.cursor/rules/unit-pytest.mdc`.
   - Performance: k6 script in `tests/perf/` if the feature touches a hot path
     (checkout, search).
4. Run the unit suite (`cd backend && pytest`) and fix failures before finishing.
5. Open a PR. In the description, link the ADO work item and list the coverage
   added and any gaps deliberately left out.

## Boundaries

- Touch only test directories and test-plan docs. Do not modify application code.
- If acceptance criteria are ambiguous, list the questions instead of guessing.
- Source test data from the matrix, not inline literals scattered across tests.
