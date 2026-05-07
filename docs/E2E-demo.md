# Agent E2E Pipeline — Demo Runbook

This doc is the day-of script for demoing the agent pipeline (see [`docs/E2E-tests.md`](./E2E-tests.md) for the underlying design and [`scripts/agent-orchestrator.ts`](../scripts/agent-orchestrator.ts) for the implementation).

The pipeline runs **automatically on every PR** to `main` via [`.github/workflows/agent-e2e.yml`](../.github/workflows/agent-e2e.yml). There is no manual trigger. The demo flow is therefore:

1. Open a PR with a known bug.
2. Wait for the `Agent E2E Exploration` check to run.
3. Show the PR comment, the workflow logs, and the resulting Linear issue.

To toggle a bug on or off, you edit app code in the PR. There are no env flags. The router gates which flow agent runs based on the diff, so each recipe below also notes which flow you should expect to be dispatched.

## Prerequisites (one-time)

GitHub repository secrets (Settings → Secrets and variables → Actions):

- `CURSOR_API_KEY` — Cursor SDK key.
- `LINEAR_API_KEY` — Linear personal or service-account key.
- `LINEAR_TEAM_ID` — Linear team UUID.
- `LINEAR_PROJECT_ID` — (optional) Linear project UUID.

Cursor cloud agent environment (Cursor settings → Cloud Agents → Environment) needs these so the spun-up backend can create real Stripe test sessions:

- `STRIPE_SECRET_KEY=sk_test_...`
- `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`

Both Linear and Cursor settings are configured **once** for the whole org; no per-PR setup.

## How to read a run

After the workflow finishes the PR comment (titled `Agent E2E Exploration`) shows:

- A **Router decisions** table — which flows were dispatched and the one-sentence reason for each. Use this to demonstrate that unrelated PRs dispatch nothing.
- A **Findings** table — every confirmed finding with its area, severity, description, Linear link, and status (`filed`, `commented`, `skipped-dismissed`, `triage-failed`).

The `agent-orchestrator-output` artifact attached to the workflow run contains the full router decision JSON, every browser agent's findings, and every triage agent's structured report.

## Bug recipes

Each recipe is a one- or two-line edit to an app file. After applying the edit, push the branch, open a PR, and wait for CI.

### Recipe 1 — Cart total off by quantity

**File:** [`backend/main.py`](../backend/main.py) inside `create_checkout_session`.

**Edit:** change

```python
"quantity": item.quantity,
```

to

```python
"quantity": 1,
```

**Expected router decision:** `cart-checkout` dispatched (diff touches `backend/main.py`); `profile-update` skipped.

**Expected finding:** "Stripe receipt total does not match cart total when quantity > 1."

**Expected Linear title:** `[MAJOR] Stripe receipt total does not match cart total when quantity > 1.`

### Recipe 2 — Payment success notice without verification

**File:** [`frontend/src/App.jsx`](../frontend/src/App.jsx) inside `hydrateCheckoutResult`, around the line beginning `if (session.payment_status === "paid") {`.

**Edit:** change the `if` to always succeed, e.g.

```js
if (true) {
  setCheckoutState({
    type: "success",
    message: "Payment confirmed. Your grocery order is placed."
  });
  setCart({});
}
```

**Expected router decision:** `cart-checkout` dispatched. `profile-update` skipped (the diff is in checkout-state code, not profile code).

**Expected finding:** "App displays payment confirmation even when Stripe payment_status is not `paid`."

**Expected Linear title:** `[CRITICAL] App displays payment confirmation even when Stripe payment_status is not paid.`

### Recipe 3 — Profile not actually persisted

**File:** [`frontend/src/App.jsx`](../frontend/src/App.jsx) inside `saveProfile`.

**Edit:** comment out the two `localStorage.setItem` calls but leave the success notice:

```js
function saveProfile(event) {
  event.preventDefault();
  // window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  // window.localStorage.setItem(PROFILE_AVATAR_KEY, profileAvatar);
  setProfileSaved(true);
  setProfileNotice("Profile saved.");
}
```

**Expected router decision:** `profile-update` dispatched. `cart-checkout` skipped (the change is in profile-only code) — though the router may dispatch both since `App.jsx` is a shared file; if it does, the cart agent should report no finding.

**Expected finding:** "Profile shows `Profile saved.` but values do not survive page reload."

**Expected Linear title:** `[MAJOR] Profile shows 'Profile saved.' but values do not survive page reload.`

### Recipe 4 — Single-name initials crash

**File:** [`frontend/src/App.jsx`](../frontend/src/App.jsx) — the `initialsFromName` helper near the top.

**Edit:** force a crash on single-word names by indexing past the end:

```js
function initialsFromName(name) {
  const chunks = name.trim().split(" ").filter(Boolean);
  return (chunks[0][0] + chunks[1][0]).toUpperCase();
}
```

**Expected router decision:** `profile-update` dispatched.

**Expected finding:** "Saving a single-word `Full name` crashes the profile FAB and renders an empty page."

**Expected Linear title:** `[CRITICAL] Saving a single-word Full name crashes the profile FAB and renders an empty page.`

### Recipe 5 — Unrelated docs change (negative case)

**File:** any markdown file under [`docs/`](.) (or this file).

**Edit:** add a sentence anywhere.

**Expected router decision:** both flows skipped with reasoning along the lines of "diff is documentation-only".

**Expected outcome:** the workflow finishes in well under a minute, posts a PR comment with `Dispatched 0 of 2 flows`, and files no Linear issues. Use this PR to show the no-noise behavior on unrelated changes.

## Demo script (suggested order, ~5 minutes)

1. Open Recipe 5 PR first to show the router skipping cleanly. Walk through the PR comment.
2. Open Recipe 1 PR. Watch the workflow logs stream the cart agent's progress, then show the PR comment with one new Linear issue link.
3. Open Recipe 4 PR in parallel to show that a profile-only change dispatches only the profile agent.
4. Open the Linear issue from Recipe 1 to highlight the structured triage body (Suspected files, Suggested fix, Repro steps, fingerprint marker in the HTML comment at the bottom).
5. Re-run Recipe 1 by re-pushing the same branch (or open a fresh PR with the same edit) to demonstrate fingerprint dedup: the existing Linear issue gets a "Reproduced again" comment instead of a duplicate issue.

## Cleanup after demo

- Close the demo PRs without merging (or revert the bug edits if you want to keep the PR history).
- Add the `auto-qa-dismissed` label to any Linear issue you want the pipeline to ignore in future runs (its fingerprint will be skipped before triage).
- Delete the `auto-qa-filed` Linear issues that are no longer interesting.
