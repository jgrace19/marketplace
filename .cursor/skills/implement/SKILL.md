---
name: implement
description: Read a Jira ticket, plan the implementation, build it, and test it end to end. Use when the user asks to implement, build, or work a Jira ticket (e.g. "implement MAR-6", "/implement MAR-3"), or references a Jira issue key or URL and wants the work done.
disable-model-invocation: false
---

# Implement a Jira ticket

Take a Jira ticket from key to a tested, PR-ready change. You are the **orchestrator**: you own the checklist, the git steps, and the gate at the end of each phase. The token-heavy work goes to the crew below. Do **not** change the ticket's status.

## Inputs

Expect a Jira issue key (e.g. `MAR-6`) or a Jira URL. If none is given, ask for one before proceeding.

## The crew

**Spend on judgment, save on volume**: expensive thinking models where errors compound (plan synthesis, acceptance review), cheap fast models where tokens pile up (exploration, code-writing, mechanical verification).

| Role | Phase | Subagent type | Model |
|---|---|---|---|
| **Scout** | Plan — context | `explore` | `composer-2.5-fast` |
| **Architect** | Plan — synthesis | you (large tickets: `generalPurpose`) | `claude-fable-5-thinking-xhigh` |
| **Builder** | Implement | `generalPurpose` | `cursor-grok-4.5-high-fast` |
| **Verifier** | Test — mechanics | `shell` (UI walkthrough: `browser-use`) | `composer-2.5-fast` |
| **Judge** | Test — acceptance | `generalPurpose` | `gpt-5.6-sol-xhigh-fast` |

The Builder and Judge stay in **different model families** so the review catches the author's blind spots.

Subagents are context-blind — each sees only its Task prompt. Before launching any subagent, copy its prompt template from [`ROLES.md`](ROLES.md). Every downstream role receives the **brief** (ticket, acceptance criteria, plan, repo conventions; format in `ROLES.md`) verbatim: assemble it once, then paste it whole.

**Trivial-ticket branch**: for a one-file tweak with an obvious approach, skip the crew and do everything yourself — launching five subagents on a two-line ticket costs more than just doing the work.

## Workflow

Copy this checklist and track progress with the todo tool:

```
- [ ] 1. Read the ticket
- [ ] 2. Plan (Scout → Architect) and assemble the brief
- [ ] 3. Create a feature branch
- [ ] 4. Implement (Builder)
- [ ] 5. Test / verify (Verifier → Judge)
- [ ] 6. Capture a UI walkthrough (only if UI changed)
- [ ] 7. Open a PR (do NOT change ticket status)
```

### 1. Read the ticket

Use the Atlassian MCP (`plugin-atlassian-atlassian`). This workspace's cloudId is
`564eb250-21c1-45d7-81f9-527d6bf705ad` (fe-anysphere-demo.atlassian.net) and the app's project is `MAR` (JG-Marketplace).

- Call `getJiraIssue` for the key. Read summary, description, acceptance criteria, labels, and comments.
- MAR tickets typically include a **Verification user flow** section — treat it as the test script for step 5.
- If the description references other issues, meetings, or docs, pull just enough context to act.
- Restate the goal and the acceptance criteria in one short paragraph — this becomes the top of the brief.

### 2. Plan (Scout → Architect)

- Launch the **Scout** with its template. It returns the files involved, the nearest existing patterns, and the cross-cutting touch points, all with `file:line` references.
- As **Architect**, write the plan from the Scout's report: files to add/change, the approach, and how each acceptance criterion will be met. For a large or ambiguous ticket, delegate synthesis to a dedicated Architect subagent (template in `ROLES.md`); if the ticket needs user decisions, switch to Plan mode instead.
- Assemble the **brief**.
- **Gate**: every acceptance criterion maps to a named file change in the plan.

### 3. Create a feature branch

Never commit on `main`. Branch from an up-to-date `main`:

```bash
git switch main && git pull --ff-only
git switch -c <type>/<short-desc>   # e.g. feat/order-tracker, fix/cart-badge-count
```

Then call the `SetActiveBranch` tool for this repo path so the UI tracks the branch.

### 4. Implement (Builder)

- Launch the **Builder** with its template: the brief plus the build-from-scratch guardrail. The Builder writes every change fresh against the brief — it must not restore, revert, cherry-pick, or copy implementation code from other branches, tags, or historical commits, even if a prior implementation exists in git history.
- **Gate** (run it yourself; a subagent's own report is not the gate): a diff exists, `cd frontend && npm run build` passes, and `ReadLints` is clean on every edited file.

### 5. Test / verify (Verifier → Judge)

This repo has **no lint or unit-test scripts**. The gates are the production build plus live verification.

- Start the app per the [start-native-local](../start-native-local/SKILL.md) skill (uvicorn on :8000, Vite on :5173) yourself — the Verifier expects running servers.
- Launch the **Verifier** with its template: it runs the health check, exercises every new/changed endpoint with `curl` (success **and** error paths), walks the ticket's **Verification user flow**, and returns transcripts as evidence.
- Launch the **Judge** with the brief plus the Verifier's evidence. It rules each acceptance criterion **green** or **red** with a reason.
- **Escalate on red**: send red verdicts back to the Builder to fix, then re-run Verifier and Judge on the affected criteria. Follow the escalation ladder in `ROLES.md` — the third red on the same criterion moves the fix to a stronger model.
- **Stripe caveat:** full checkout requires `STRIPE_SECRET_KEY` / `VITE_STRIPE_PUBLISHABLE_KEY` in `.env`. Without keys, verification stops at session creation; say so in the PR rather than reporting checkout as tested.
- **Gate**: every acceptance criterion has a green verdict backed by observed evidence (or a documented Stripe-key limitation).

### 6. Capture a UI walkthrough (UI changes only)

If the change is user-visible (pages, nav, components, styling), the task is not done until a visual artifact exists — follow the [capture-ui-walkthrough](../capture-ui-walkthrough/SKILL.md) skill. Its `browser-use` subagent is the Verifier in browser form: pin it to `composer-2.5-fast`. `npm run build` alone is not sufficient for UI work. Skip this step for non-UI tickets.

### 7. Open a PR

Commit on the feature branch, push, and open a PR to `main` with `gh`:

- Reference the ticket key in the PR title or body (e.g. `MAR-6`).
- In the body, summarize the change, list the Judge's verdict per acceptance criterion, and note verification (`npm run build`, curl checks, user-flow walkthrough).
- Report the PR URL to the user.

**Do not transition or comment the ticket's status** — leave Jira status changes to the user.

## Notes

- Only push to `main` via PR; never push directly.
- Git write operations (branch, commit, push, PR) stay with you, the orchestrator — subagents read the repo but never commit.
- Native dev servers use **8000/5173**; Docker publishes **8001/8081** — they can run side by side, so don't kill Docker's ports.
