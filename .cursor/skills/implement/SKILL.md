---
name: implement
description: Read a Jira ticket, plan the implementation, build it, and test it end to end. Use when the user asks to implement, build, or work a Jira ticket (e.g. "implement MAR-6", "/implement MAR-3"), or references a Jira issue key or URL and wants the work done.
disable-model-invocation: false
---

# Implement a Jira ticket

Take a Jira ticket from key to a tested, PR-ready change. Read the ticket, plan, implement against this repo's conventions, verify, and open a PR. Do **not** change the ticket's status.

## Inputs

Expect a Jira issue key (e.g. `MAR-6`) or a Jira URL. If none is given, ask for one before proceeding.

## Workflow

Copy this checklist and track progress with the todo tool:

```
- [ ] 1. Read the ticket
- [ ] 2. Plan the implementation
- [ ] 3. Create a feature branch
- [ ] 4. Implement
- [ ] 5. Test / verify
- [ ] 6. Capture a UI walkthrough (only if UI changed)
- [ ] 7. Open a PR (do NOT change ticket status)
```

### 1. Read the ticket

Use the Atlassian MCP (`plugin-atlassian-atlassian`). This workspace's cloudId is
`564eb250-21c1-45d7-81f9-527d6bf705ad` (fe-anysphere-demo.atlassian.net) and the app's project is `MAR` (JG-Marketplace).

- Call `getJiraIssue` for the key. Read summary, description, acceptance criteria, labels, and comments.
- MAR tickets typically include a **Verification user flow** section — treat it as the test script for step 5.
- If the description references other issues, meetings, or docs, pull just enough context to act.
- Restate the goal and the acceptance criteria in one short paragraph before planning.

### 2. Plan the implementation

- Explore the codebase for the files involved. The app is small: FastAPI backend in `backend/main.py` (endpoints) and `backend/stores.py` (static store registry + catalogs); React SPA in `frontend/src/App.jsx` (all page state — there is no router), `CartDrawer.jsx`, `CartsHub.jsx`, styles in `frontend/src/App.css`.
- Identify cross-cutting touch points: localStorage persistence (`readJsonStorage` + the `freshcart-*` storage-key pattern in `App.jsx`), Stripe session metadata plumbing in `create_checkout_session` / `session-status`, and the QA-agent flows in `.github/qa-agents/*.yaml`.
- Write a short plan: files to add/change, the approach, and how each acceptance criterion will be met. For large or ambiguous tickets, switch to Plan mode first.

### 3. Create a feature branch

Never commit on `main`. Branch from an up-to-date `main`:

```bash
git switch main && git pull --ff-only
git switch -c <type>/<short-desc>   # e.g. feat/order-tracker, fix/cart-badge-count
```

Then call the `SetActiveBranch` tool for this repo path so the UI tracks the branch.

### 4. Implement

- **Build the feature from scratch against the ticket's acceptance criteria.** Do **not** restore, revert, cherry-pick, or copy implementation code from other branches, tags, or historical commits, even if a prior implementation already exists in git history. Treat the feature as brand new.
- Follow existing patterns: dataclasses + plain functions in the backend, no database and no auth — catalogs are static in `stores.py`, all user state lives in localStorage. New client state gets its own `freshcart-*` storage key.
- New backend endpoints go in `backend/main.py` with the existing validation style (`_require_store`, Pydantic models, `HTTPException` with clear detail).
- Frontend: match the existing plain-React style (hooks in `App.jsx`, components as siblings like `CartDrawer.jsx`), and reuse the class/style conventions already in `App.css`. No new dependencies unless the ticket demands them.
- Don't add narration comments. Wire new pages into the header nav the way Profile is wired.

### 5. Test / verify

This repo has **no lint or unit-test scripts**. The gates are the production build plus live verification:

```bash
cd frontend && npm run build        # canonical frontend gate (vite build)
```

- Run `ReadLints` on edited files and fix introduced lints.
- Start the app per the [start-native-local](../start-native-local/SKILL.md) skill (uvicorn on :8000, Vite on :5173) and confirm `curl -fsS http://127.0.0.1:8000/api/health` returns ok.
- Exercise any new/changed endpoints directly with `curl` (success **and** error paths).
- Walk the ticket's **Verification user flow** end to end in the running app and confirm each acceptance criterion.
- **If you added or changed an API endpoint**, update the matching QA-agent flow in `.github/qa-agents/` (add the touched paths and extend the `focus_prompt`) so the flow stays covered.
- **Stripe caveat:** full checkout requires `STRIPE_SECRET_KEY` / `VITE_STRIPE_PUBLISHABLE_KEY` in `.env`. Without keys, verify up to session creation and say so in the PR — don't report an unverified checkout as tested.

### 6. Capture a UI walkthrough (UI changes only)

If the change is user-visible (pages, nav, components, styling), the task is not done until a visual artifact exists — see the [capture-ui-walkthrough](../capture-ui-walkthrough/SKILL.md) skill. `npm run build` alone is not sufficient for UI work. Skip this step for non-UI tickets.

### 7. Open a PR

Commit on the feature branch, push, and open a PR to `main` with `gh`:

- Reference the ticket key in the PR title or body (e.g. `MAR-6`).
- In the body, summarize the change, list how acceptance criteria are met, and note verification (`npm run build`, curl checks, user-flow walkthrough).
- Report the PR URL to the user.

**Do not transition or comment the ticket's status** — leave Jira status changes to the user.

## Notes

- Only push to `main` via PR; never push directly.
- Native dev servers use **8000/5173**; Docker publishes **8001/8081** — they can run side by side, so don't kill Docker's ports.
