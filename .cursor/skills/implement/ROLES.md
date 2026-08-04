# Crew prompt templates

Launch mechanics for each role in the [implement](SKILL.md) skill. Every Task prompt must be self-contained: the subagent sees nothing but what you paste into it. Fill each `<...>` placeholder; pass the role's model slug via the Task tool's `model` parameter.

## The brief

Assemble once, after the plan gate passes. Paste verbatim into the Builder, Verifier, and Judge prompts — it is the single source of truth for the change.

```
## Ticket
<KEY>: <one-paragraph restatement of the goal>

## Acceptance criteria
1. <criterion>
2. <criterion>

## Verification user flow
<copied from the ticket>

## Plan
<the Architect's plan: files to add/change, approach, and the criterion → change mapping>

## Repo conventions
- FastAPI backend: endpoints in backend/main.py, static store registry + catalogs in
  backend/stores.py. Dataclasses + plain functions; no database, no auth.
- New endpoints go in backend/main.py using the existing validation style
  (_require_store, Pydantic models, HTTPException with clear detail).
- React SPA: all page state in frontend/src/App.jsx (there is no router), components as
  siblings (CartDrawer.jsx, CartsHub.jsx), styles in frontend/src/App.css. Plain React
  hooks; reuse the existing class/style conventions. New dependencies only if the
  ticket demands them.
- Client state lives in localStorage via readJsonStorage; new state gets its own
  freshcart-* storage key.
- Stripe session metadata is plumbed through create_checkout_session / session-status
  in backend/main.py.
- If an API endpoint is added or changed, update the matching QA-agent flow in
  .github/qa-agents/ (add the touched paths, extend the focus_prompt).
- Wire new pages into the header nav the way Profile is wired. No narration comments.
```

## Scout — `explore`, `composer-2.5-fast`

```
Explore the FreshCart repo at <REPO PATH> for Jira ticket <KEY>.

Ticket goal: <one-paragraph restatement>
Acceptance criteria: <list>

Repo map to start from: FastAPI backend in backend/main.py (endpoints) and
backend/stores.py (store registry + catalogs); React SPA in frontend/src/App.jsx
(all page state, no router), CartDrawer.jsx, CartsHub.jsx, styles in
frontend/src/App.css; QA-agent flows in .github/qa-agents/*.yaml.

Thoroughness: medium. Return facts with file:line references, no plan:
1. Every file this change will touch, with the relevant line ranges.
2. The nearest existing pattern to imitate for each piece (similar endpoint,
   similar component, similar CSS block).
3. Cross-cutting touch points: localStorage persistence (readJsonStorage,
   freshcart-* keys), Stripe session metadata (create_checkout_session /
   session-status), and any QA-agent flow covering the touched endpoints.
```

## Architect — `generalPurpose`, `claude-fable-5-thinking-xhigh`

Default: the orchestrator writes the plan itself from the Scout's report. Delegate only when the ticket is large or ambiguous.

```
Plan the implementation of Jira ticket <KEY> in the FreshCart repo at <REPO PATH>.
Read code as needed; make no edits.

Ticket goal: <one-paragraph restatement>
Acceptance criteria: <list>
Verification user flow: <copied from the ticket>

Scout report:
<paste the Scout's findings>

Return a plan: files to add/change, the approach, and a mapping from each
acceptance criterion to the change that satisfies it. Flag open questions
instead of guessing.
```

## Builder — `generalPurpose`, `cursor-grok-4.5-high-fast`

```
Implement Jira ticket <KEY> in the FreshCart repo at <REPO PATH>. The feature
branch <BRANCH> is already checked out — work there.

<paste the brief>

Build the feature from scratch against the brief. Do not restore, revert,
cherry-pick, or copy implementation code from other branches, tags, or
historical commits, even if a prior implementation exists in git history.

When done: run `cd frontend && npm run build` and fix any failure; fix lints
you introduced. Make no git commits — leave the working tree dirty for the
orchestrator. Return the list of files you changed and anything you could
not complete.
```

## Verifier — `shell`, `composer-2.5-fast`

Start the servers first (start-native-local skill); the Verifier only observes.

```
Verify a change to FreshCart. Servers are already running: API at
http://127.0.0.1:8000, frontend at http://127.0.0.1:5173. This is read-only
verification — edit no files, restart no servers.

<paste the brief>

Run and capture output for:
1. curl -fsS http://127.0.0.1:8000/api/health
2. Every new/changed endpoint listed in the plan: the success path and at
   least one error path each.
3. The Verification user flow, step by step, using curl against the API where
   the flow allows; flag any step that needs a real browser instead of
   attempting it.

Return a transcript: each command, its output, and pass/fail per step. Report
failures verbatim; fix nothing.
```

For UI tickets, the browser-form Verifier is the `browser-use` subagent described in the [capture-ui-walkthrough](../capture-ui-walkthrough/SKILL.md) skill — same model pin, `composer-2.5-fast`.

## Judge — `generalPurpose`, `gpt-5.6-sol-xhigh-fast`

```
Judge whether an implementation of Jira ticket <KEY> meets its acceptance
criteria. Repo: <REPO PATH>, branch <BRANCH>. Read the diff and code as
needed; make no edits.

<paste the brief>

Verifier evidence:
<paste the Verifier transcript and, for UI tickets, the walkthrough result>

Rule each acceptance criterion green or red. Green requires observed
evidence — a passing command in the transcript, a walked flow step, or code
you read yourself. Rule red with the specific gap when evidence is missing
or contradicts the criterion. Also flag violations of the brief's repo
conventions. Return only the verdict list with reasons.
```

## Escalation ladder

1. **First red**: send the red verdicts plus the brief back to the **Builder** (`cursor-grok-4.5-high-fast`) to fix; re-run the Verifier and Judge on the affected criteria.
2. **Second red on the same criterion**: one more Builder loop.
3. **Third red on the same criterion**: escalate the fix to a `generalPurpose` subagent on `gpt-5.6-sol-xhigh-fast`, giving it the brief, the red history, and what the Builder tried. You pay for the strong model only after the cheap one has demonstrably failed.
