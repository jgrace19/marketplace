`# Agent-Based E2E Testing Pipeline — Solution Plan`

 ``

`A CI/CD pipeline that uses parallel browser-driving agents to probe critical user flows for bugs, then dispatches code-aware triage agents that file detailed bug reports to Linear automatically.`



`## Goals`

 ``

`- Find bugs that scripted regression tests miss (edge cases, state bugs, error paths, UX issues).`

`- Only run agents whose flows are plausibly affected by a given PR.`

`- Produce **actionable** bug reports — with steps to repro, root cause hypothesis, suspected files, and recent suspect commits — not just "something looked broken."`

`- Keep deterministic regression tests (Playwright) as the primary CI signal. Agents are additive.`

`## Non-Goals`

 ``

`- Replacing scripted Playwright tests for known critical flows. Agents complement them; they don't substitute.`

`- Gating PR merges on agent runs. Agents are non-deterministic — running them on every PR is fine, but blocking merges on their findings is not.`

`- Production testing. Everything runs against staging or ephemeral preview environments.`

`## Architecture Overview`

 ``

`Three layers, each playing to its strengths:`

 ``

`1. **Browser exploration layer** — Anthropic Agent SDK + Playwright MCP. Drives real browsers against a real environment, finds bugs, produces structured findings.`

`2. **Code-aware triage layer** — Cursor Cloud Agents. Has the repo cloned, investigates each finding in the codebase, suggests root cause and fix.`

`3. **Reporting layer** — Linear SDK (REST). Orchestrator code files issues with consistent structure.`

`````

`┌─────────────────────────────────────────────────────────────────┐`

`│  GitHub Actions Job                                             │`

`│                                                                 │`

`│  1. Spin up app stack (Docker Compose)                          │`

`│  2. Router agent reads PR diff + agent configs                  │`

`│  3. Dispatched browser workers run in parallel ─┐               │`

`│       (Anthropic SDK, same process, Promise.all)│               │`

`│                                                 ↓               │`

`│  4. Findings collected, deduped, fingerprinted                  │`

`│                                                 │               │`

`│  5. Per actionable finding: spawn Cursor cloud agent            │`

`│       (run.stream() → structured triage JSON)   │               │`

`│                                                 ↓               │`

`│  6. Linear issues filed (or comments on duplicates)             │`

`│  7. Summary posted as PR comment                                │`

`└─────────────────────────────────────────────────────────────────┘`

`````

 ``

`## Component Choices and Rationale`

 ``

`### Browser layer: Anthropic Agent SDK, not Cursor`

 ``

`Browser-driving exploration doesn't benefit from Cursor's coding-agent harness (codebase indexing, semantic search). Same-process orchestration via Promise.all makes parent/child reporting trivial — children "report back" by returning function results. No polling, no message queues, no separate infrastructure.`

 ``

`### Triage layer: Cursor Cloud Agents`

 ``

`This is where Cursor earns its keep. Each triage task gets a dedicated VM with the repo cloned and indexed. The agent can grep, run semantic search, read git history, and reason about the codebase. Different agent per finding because v1 only allows one active run per agent.`

 ``

`### Reporting: Linear SDK directly, not Linear MCP`

 ``

`Deterministic structure beats agent flexibility for issue filing. The orchestrator owns formatting, labels, project assignment, and dedup logic. Agents produce structured triage output; orchestrator decides what to do with it.`

 ``

`### Environment: Docker Compose in the runner`

 ``

`Self-contained, fast to iterate on, all logs in one place. Graduate to per-PR preview environments only if the stack outgrows what fits in a runner.`

 ``

`## Pipeline Flow`

 ``

`### 1. Environment setup (Docker Compose in CI runner)`

 ``

`docker-compose.ci.yml brings up frontend, backend, Postgres, mail catcher (Mailpit), and any other dependencies. Health checks gate the next steps. Test data seeded deterministically. Stripe (or equivalent) in test mode with documented test cards.`

 ``

`### 2. Router agent`

 ``

`A small Anthropic SDK call that reads:`

 ``

`- The PR diff git diff origin/main...HEAD)`

`- Agent config files in .github/qa-agents/*.yaml`

`…and outputs a JSON dispatch plan: { "dispatch": ["checkout", "auth"], "skip": [...], "reasoning": "..." }.`

 ``

`Each agent config looks like:`

 ``

````yaml`

`# .github/qa-agents/checkout.yaml`

`id: checkout`

`description: |`

  `Tests the cart and checkout flow. Touches: cart state, payment processing,`

  `order confirmation, inventory checks. Should run if the diff touches /cart,`

  `/checkout, /payments, /orders, or shared components used by these.`

`focus_prompt: |`

  `Probe the checkout flow for bugs. Try declined cards, 3DS challenges,`

  `cart state under refresh, promo code edge cases. Don't test unrelated areas.`

`test_account: qa-bot-checkout@example.com`

`allowed_tools:`

  `- mcp__playwright__browser_navigate`

  `- mcp__playwright__browser_click`

  `- mcp__playwright__browser_type`

  `- mcp__playwright__browser_snapshot`

  `- mcp__playwright__browser_take_screenshot`

  `- Write`

`max_turns: 60`

`budget_usd: 2.00`

`````

 ``

`### 3. Browser worker fan-out`

 ``

````typescript`

`const workerResults = await Promise.all(`

  `dispatchPlan.dispatch.map(async (agentId) => {`

    `const config = configs[agentId];`

    `for await (const message of query({`

      `prompt: buildWorkerPrompt(config, TARGET_URL),`

      `options: {`

        `mcpServers: {`

          `playwright: {`

            `command: "npx",`

            `args: ["@playwright/mcp@latest", "--headless", "--isolated"],`

          `},`

        `},`

        `allowedTools: config.allowedTools,`

        `maxTurns: config.maxTurns,`

        `cwd: ./output/${agentId},`

      `},`

    `})) {`

      `// Stream progress to CI logs with [agentId] prefix`

      `// Each finding written as JSON to ./output/${agentId}/finding-N.json`

    `}`

    `return loadFindings(agentId);`

  `})`

`);`

`````

 ``

`Each worker:`

`- Has its own isolated Chromium (via --isolated)`

`- Operates on its own scoped test account`

`- Writes findings as JSON files plus screenshots/traces`

`### 4. Dedup and fingerprinting`

 ``

`Before spending money on triage, fingerprint each finding:`

 ``

`````

`fingerprint = hash({`

  `area: "checkout",`

  `normalized_error: "TypeError: cannot read properties of undefined",`

  `dom_path: "form > input[name=cardnumber]",`

  `http_status_pattern: "500"`

`})`

`````

 ``

`- Skip findings whose fingerprint matches a known-dismissed issue (Linear label auto-qa-dismissed).`

`- Skip findings whose fingerprint already exists as an open Linear issue — comment on it instead.`

`- Skip findings the agent itself flagged as low-confidence.`

`### 5. Per-finding triage (Cursor cloud agent)`

 ``

`For each surviving finding, spawn a Cursor cloud agent:`

 ``

````typescript`

`const agent = await Agent.create({`

  `apiKey: process.env.CURSOR_API_KEY!,`

  `model: { id: "composer-2" },`

  `cloud: { repo: process.env.GITHUB_REPOSITORY!, ref: process.env.GITHUB_SHA! },`

`});`

 ``

`const run = await agent.send(triagePrompt(finding));`

 ``

`for await (const event of run.stream()) {`

  `if (event.type === "assistant") logProgress(finding.id, event);`

  `if (event.type === "task" && event.task?.status === "complete") {`

    `triageReport = JSON.parse(event.task.result);`

  `}`

`}`

`````

 ``

`The triage agent must output JSON with this schema:`

 ``

````json`

`{`

  `"rootCause": "string — one paragraph",`

  `"suspectedFiles": [{ "path": "...", "lines": "...", "why": "..." }],`

  `"recentRelevantCommits": [{ "sha": "...", "message": "...", "why": "..." }],`

  `"existingTestGap": "string or null",`

  `"suggestedFix": "string — concrete, no code",`

  `"severity": "critical | major | minor | cosmetic",`

  `"confidence": "high | medium | low"`

`}`

`````

 ``

`Run Promise.all across triage agents — they're independent VMs, so they parallelize cleanly.`

 ``

`### 6. File to Linear`

 ``

````typescript`

`for (const { finding, triage } of triageReports) {`

  `if (triage.confidence === "low") continue;`

 ``

  `const existing = await findExistingIssue(finding.fingerprint);`

  `if (existing) {`

    `await linear.commentCreate({`

      `issueId: existing.id,`

      `body: Reproduced in PR #${prNumber}. ${triage.rootCause},`

    `});`

    `continue;`

  `}`

 ``

  `await linear.issueCreate({`

    `teamId: LINEAR_TEAM_ID,`

    `projectId: LINEAR_PROJECT_ID,`

    `title: [${triage.severity.toUpperCase()}] ${finding.description},`

    `description: formatLinearBody(finding, triage),`

    `labelIds: [LABEL_AUTO_FILED, severityLabel(triage.severity), areaLabel(finding.area)],`

    `priority: severityToPriority(triage.severity),`

  `});`

`}`

`````

 ``

`Issue body includes: summary, severity/confidence, repro steps, suspected root cause, suspected files (with permalinks), recent suspect commits (with permalinks), test coverage gap, and links to artifacts (screenshots, traces, logs).`

 ``

`### 7. PR comment summary`

 ``

`A short summary posted to the PR: how many flows were probed, how many findings, how many filed to Linear (with links), how many were duplicates of existing issues.`

 ``

`## GitHub Actions Workflow Sketch`

 ``

````yaml`

`name: Agent E2E Exploration`

 ``

`on:`

  `pull_request:`

    `branches: [main]`

 ``

`jobs:`

  `agent-e2e:`

    `timeout-minutes: 45`

    `runs-on: ubuntu-latest-8-cores`

    `steps:`

      `- uses: actions/checkout@v4`

        `with: { fetch-depth: 0 }  # need history for diff analysis`

      `- uses: actions/setup-node@v4`

        `with: { node-version: '20', cache: 'npm' }`

      `- run: npm ci`

 ``

      `- name: Start app stack`

        `run: docker compose -f docker-compose.ci.yml up -d --build`

      `- name: Wait for stack`

        `run: npx wait-on http://localhost:3000 http://localhost:8000/health --timeout 120000`

      `- name: Seed test data`

        `run: docker compose -f docker-compose.ci.yml exec -T backend npm run seed:test`

 ``

      `- run: npx playwright install --with-deps chromium`

 ``

      `- name: Run agent orchestrator`

        `run: node scripts/agent-orchestrator.ts`

        `env:`

          `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`

          `CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}`

          `LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}`

          `LINEAR_TEAM_ID: ${{ secrets.LINEAR_TEAM_ID }}`

          `LINEAR_PROJECT_ID: ${{ secrets.LINEAR_PROJECT_ID }}`

          `TARGET_URL: http://localhost:3000`

          `GITHUB_REPOSITORY: ${{ github.repository }}`

          `GITHUB_SHA: ${{ github.event.pull_request.head.sha }}`

          `PR_NUMBER: ${{ github.event.pull_request.number }}`

          `BASE_SHA: ${{ github.event.pull_request.base.sha }}`

          `STRIPE_TEST_KEY: ${{ secrets.STRIPE_TEST_KEY }}`

          `QA_TEST_PASSWORD: ${{ secrets.QA_TEST_PASSWORD }}`

 ``

      `- name: Upload artifacts`

        `if: always()`

        `uses: actions/upload-artifact@v4`

        `with:`

          `name: agent-output`

          `path: output/`

          `retention-days: 14`

 ``

      `- name: Dump container logs on failure`

        `if: failure()`

        `run: docker compose -f docker-compose.ci.yml logs`

`````

 ``

`## Cost and Resource Controls`

 ``

`- **Per-worker maxTurns cap** in agent configs.`

`- **Per-worker budget cap** enforced by tracking token usage in the SDK stream and aborting on threshold.`

`- **Triage skipped for low-confidence findings** — the cheapest filter is to not triage.`

`- **Triage skipped for known-dismissed fingerprints** — Linear label auto-qa-dismissed short-circuits.`

`- **Whole-job timeout** in GitHub Actions (45 min).`

`- **Runner sizing** — ubuntu-latest-8-cores for parallel Chromium + app stack. Standard runner if worker count is small.`

`## Failure Modes and Mitigations`

 ``

`| Failure mode | Mitigation |`

`|---|---|`

`| Agent finds the same bug repeatedly across runs | Fingerprint + comment on existing issue instead of refile |`

`| Agent files duplicate issues within one run | Fingerprint dedup before triage |`

`| Browser worker hangs | maxTurns cap + job-level timeout |`

`| Cursor cloud agent returns malformed JSON | Wrap parse in try/catch; fall back to filing without code triage |`

`| Linear API down | Write findings to artifacts; retry-from-artifacts script |`

`| Engineers stop trusting agent issues | auto-qa-dismissed label feeds dedup; weekly review of dismiss rate; tune mission prompts |`

`| Agent does something destructive on staging | Per-agent test accounts; no admin credentials; staging DB resets nightly |`

`| Stripe (or other paid integration) hits real money | Test-mode keys only; never inject prod secrets into the job |`

 ``

`## Rollout Plan`

 ``

`**Phase 1: One flow, no Linear filing** (1-2 weeks). Run only the checkout worker. Output findings as PR comments. Triage agent runs but its output is informational. Goal: tune mission prompt, validate finding quality, measure flake rate.`

 ``

`**Phase 2: Linear filing for one flow** (2-4 weeks). Enable issue filing for checkout findings only. Manual review of every filed issue. Track: % filed that turn out to be real bugs, % dismissed, time-to-resolution. Tune dedup fingerprinting based on real duplicates seen.`

 ``

`**Phase 3: Expand to other flows.** Add agent configs one at a time (auth, search, account settings, etc.). Each new flow goes through phase 1 → 2 before joining the rotation.`

 ``

`**Phase 4: Run-mode tuning.** Decide based on data: keep on every PR, move to nightly on main, or hybrid (PR-triggered for diff-affected flows, nightly for everything).`

 ``

`## Success Metrics`

 ``

`- **Real-bug rate:** of agent-filed Linear issues, what % were fixed (not dismissed)? Target ≥ 40% after tuning.`

`- **Time-to-detection delta:** for bugs the agent catches, how much earlier was it caught vs. when it would have been found in production / by users?`

`- **Engineer satisfaction:** survey after 1 month and 3 months. The honest signal is whether engineers triage agent issues promptly or ignore them.`

`- **Cost per real bug found:** total monthly spend / count of real bugs filed. Useful to compare against alternative QA investments.`

`## Open Questions to Decide Before Building`

 ``

`1. **Run on every PR, or nightly against main?** Per-PR catches bugs before merge but costs more. Nightly is cheaper but catches bugs after they're in. Probably start nightly, move to per-PR once trust is established.`

`2. **Which flows go first?** Checkout is the obvious candidate (high stakes, well-defined). Auth and search are also good early candidates.`

`3. **Who owns triage of filed issues?** Whichever team owns the flow, or a rotating QA bug-bash slot? This needs an owner from day one or issues will pile up.`

`4. **What's the dismiss workflow?** Engineers need a one-click way to mark a filed issue as not-a-bug so the fingerprint goes into the dismissed set. Linear automation rule on label auto-qa-dismissed.`