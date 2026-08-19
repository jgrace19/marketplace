---
name: prototype
description: Prototype a FreshCart feature from a Confluence PRD, a Jira ticket, or a freeform idea using mocked or static data, then capture a UI walkthrough and open a PR. Use when the user asks to prototype, mock, spike, or demo a feature from a PRD, Confluence page, Jira issue (e.g. MAR-6), or just an idea.
disable-model-invocation: true
---

# Prototype a FreshCart feature

Turn a PRD, Jira ticket, or idea into a clickable FreshCart prototype. Prefer mocked or static data over real integrations. Ship a UI walkthrough and a PR. Do **not** change Jira ticket status.

This is not [implement](../implement/SKILL.md). Implement builds the ticket for real. This skill spikes a demo-shaped slice, even when the source is a Jira key.

## Inputs

Expect one of:

| Source | Examples |
|--------|----------|
| Confluence PRD | Page URL, space + title, or pasted PRD text |
| Jira ticket | Issue key (`MAR-6`) or Jira URL |
| Idea | A paragraph, bullet list, or "what if we had X" in the chat |

If the user named a source, use it. If they only said "prototype" with no idea, ask which of the three they have — do not demand a PRD.

When more than one is given (e.g. a ticket that links a PRD), read both; the ticket's acceptance criteria win on conflicts.

## Workflow

Copy this checklist and track progress with the todo tool:

```
- [ ] 1. Read the source
- [ ] 2. Scope the prototype (mock vs static)
- [ ] 3. Create a feature branch
- [ ] 4. Implement the prototype
- [ ] 5. Test / verify
- [ ] 6. Capture a UI walkthrough
- [ ] 7. Open a PR
```

### 1. Read the source

Atlassian cloudId is `564eb250-21c1-45d7-81f9-527d6bf705ad` (`fe-anysphere-demo.atlassian.net`). Jira project is `MAR` (JG-Marketplace). Use MCP `plugin-atlassian-atlassian`; discover tools first (`GetMcpTools`).

**Idea** — treat the user's text as the spec. Do not fetch Jira/Confluence unless they pointed at one.

**Jira** — `getJiraIssue` for the key. Read summary, description, acceptance criteria, labels, comments. MAR tickets often include a **Verification user flow** — use it as the prototype happy path. Pull linked docs only as needed.

**Confluence PRD** — if they pasted it, use that text. Otherwise fetch the page by URL, page id, or title search. If MCP fails, `WebFetch` the URL; if that fails, ask them to paste it.

Extract, then restate in one short paragraph before planning:

- Problem / goal
- Primary user and happy-path flow
- Acceptance criteria (or inferred ones, if this is an idea)
- Explicit out of scope
- Data the UI needs (entities, fields, lists)

For an idea with no AC, invent a tight happy path and list it back — get a yes before building if the idea is ambiguous; otherwise proceed.

Ignore visual-design specs that fight FreshCart — match existing `App.css` and component patterns.

### 2. Scope the prototype (mock vs static)

Data calls can be mocked or static. Do **not** add a database, real auth, or a new third-party API for the prototype.

Choose the lightest option that still makes the UI feel real:

| Need | Default |
|------|---------|
| Catalog, stores, products, deals | Extend the static registry in `backend/stores.py` |
| New read API the UI will call | Add a FastAPI endpoint in `backend/main.py` that returns canned JSON (same `_require_store` / `HTTPException` style) |
| User-owned state (prefs, lists, flags) | `localStorage` with a new `freshcart-*` key via `readJsonStorage` in `App.jsx` |
| Write path with no real backend | Optimistic UI + localStorage; POST may echo the payload or a fixture |
| External service (maps, recs, search, payments beyond existing Stripe) | Stub with a static fixture. Reuse Stripe only if the source is actually checkout and keys already exist |

Call out in the plan (and later the PR) what is mocked vs what is real. If the source demands a live integration you are stubbing, say so before building.

Explore the codebase, then write a short plan: files to add/change, the happy path, fixtures you will invent, and how each acceptance criterion shows up in the UI.

The app is small: FastAPI in `backend/main.py` + `backend/stores.py`; React SPA in `frontend/src/App.jsx` (no router), `CartDrawer.jsx`, `CartsHub.jsx`, styles in `frontend/src/App.css`.

### 3. Create a feature branch

Never commit on `main`. Branch from an up-to-date `main`:

```bash
git switch main && git pull --ff-only
git switch -c proto/<short-desc>   # e.g. proto/reorder-favorites
```

Then call the `SetActiveBranch` tool for this repo path so the UI tracks the branch.

### 4. Implement the prototype

- Build from the restated happy path. Do **not** restore, revert, cherry-pick, or copy implementation from other branches.
- Follow existing patterns: dataclasses + plain functions in the backend; no database and no auth; catalogs static in `stores.py`; user state in localStorage.
- New endpoints go in `backend/main.py`. Keep payloads small and demo-shaped — enough fields to render the flow, not a production schema.
- Frontend: plain React hooks in `App.jsx` or a sibling component (`CartDrawer.jsx` style). Reuse `App.css`. No new dependencies unless the flow cannot be shown without them.
- Wire new pages into the header nav the way Profile is wired. Don't add narration comments.

Invent realistic fixture copy (store names, product rows, order history) rather than `lorem` / `foo` / empty lists.

### 5. Test / verify

This repo has **no lint or unit-test scripts**. The gates are the production build plus live verification:

```bash
cd frontend && npm run build        # canonical frontend gate (vite build)
```

- Run `ReadLints` on edited files and fix introduced lints.
- Start the app per the [start-native-local](../start-native-local/SKILL.md) skill (uvicorn on :8000, Vite on :5173) and confirm `curl -fsS http://127.0.0.1:8000/api/health` returns ok.
- Exercise any new/changed endpoints with `curl` (success **and** error paths), even if they return fixtures.
- Walk the happy path end to end in the running app and confirm each in-scope acceptance criterion.
- If you added an API endpoint, update the matching QA-agent flow in `.github/qa-agents/` (touched paths + `focus_prompt`).
- **Stripe caveat:** full checkout needs `STRIPE_SECRET_KEY` / `VITE_STRIPE_PUBLISHABLE_KEY` in `.env`. Without keys, stop at session creation and say so — don't report an unverified checkout as tested.

### 6. Capture a UI walkthrough

Prototypes are user-visible. The task is not done until a visual artifact exists. Follow [capture-ui-walkthrough](../capture-ui-walkthrough/SKILL.md) in full. `npm run build` alone is not sufficient.

Required outcomes from that skill:

- Main agent owns `RecordScreen` START/SAVE; the `browser-use` subagent only drives real desktop Chrome (never ffmpeg / RecordScreen).
- Multi-step flows → video. Single static state → full-page screenshots are acceptable.
- Verify frames before attaching: at least two frames differ **and** the new UI is visible. Reject blank, static, or feature-missing clips.
- Attach the verified video (or screenshots) to **both** the PR description and the final reply.

Walk the restated happy path, not a generic store-browse. Pause ~1s on each new state.

### 7. Open a PR

Commit on the feature branch, push, and open a PR to `main` with `gh`:

- Title like `proto: <short name>`. Include the Jira key in the title when the source was a ticket (e.g. `proto: MAR-6 order tracker`).
- In the body, link the Confluence page and/or Jira issue when they exist; otherwise restate the idea in one sentence.
- Summarize the prototype, list in-scope acceptance criteria, and label mocked/static vs real data.
- Note verification (`npm run build`, curl checks, user-flow walkthrough).
- Report the PR URL to the user.

**Do not** transition or comment any linked Jira ticket — leave status changes to the user.

## Notes

- Only push to `main` via PR; never push directly.
- Native dev servers use **8000/5173**; Docker publishes **8001/8081** — they can run side by side, so don't kill Docker's ports.
- If the source is larger than one happy path, prototype that path only and list follow-ups in the PR — do not build the full product spec.
