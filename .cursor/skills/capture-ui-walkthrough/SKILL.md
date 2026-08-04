---
name: capture-ui-walkthrough
description: Capture a video walkthrough (or full-page screenshots) of a user-visible UI change in a cloud agent run, using a real desktop browser subagent so the recording shows the actual FreshCart app. Use after building or changing any in-app page, flow, component, or styling and before opening or finalizing the PR.
---

# Capture UI walkthrough

Produce a visual demo artifact for any user-visible FreshCart change, verify it actually shows the changed UI, then attach it to **both** the PR and your final reply.

## Ownership model (read this first)

The single most common failure is **two processes recording at once** or the subagent producing a blank/static clip. To prevent it:

- **The main agent owns the recording.** Only the main agent runs `RecordScreen` START and SAVE.
- **The subagent only drives the browser.** It opens real desktop Chrome and walks the flow. It must **never** start its own `ffmpeg` or `RecordScreen` session.
- **Never run two recorders in parallel.** One `RecordScreen` session, owned by the main agent, for the entire capture.

## Why a subagent at all

`RecordScreen` records the VM desktop, **not** a headless Playwright viewport — a headless run captures an empty desktop. A real video requires a **real desktop browser** visible on the VM desktop. Delegate only the *driving* of that browser to the `browser-use` subagent so the long, fragile interaction sequence stays out of the main context, while the main agent keeps control of the recorder.

## Decision: video vs screenshots

- **Multi-step flow** (store selection, cart interactions, drawer/hub navigation, checkout, dynamic state) → **video** (required). Screenshots are never a substitute here. Almost every FreshCart change is a multi-step flow.
- **Single static state**, no interaction → full-page screenshots are an acceptable substitute.

## Workflow

Copy this checklist and track progress:

```
- [ ] 1. Start the app and confirm both servers respond
- [ ] 2. Identify the changed flows/states
- [ ] 3. (main agent) RecordScreen START
- [ ] 4. (subagent) Drive real desktop Chrome through the changed flow — NO recording
- [ ] 5. (main agent) RecordScreen SAVE with a descriptive filename
- [ ] 6. Verify the video by extracting/reviewing frames
- [ ] 7. Attach the verified artifact to the PR description AND your final reply
```

### 1. Start the app

Follow the [start-native-local](../start-native-local/SKILL.md) skill: FastAPI backend (uvicorn) on **:8000** and the Vite frontend on **:5173**. Before recording, confirm both are actually serving:

```bash
curl -fsS http://127.0.0.1:8000/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/
```

Do not finalize on `npm run build` alone.

### 2. Identify what changed

FreshCart is a SPA at a single URL — there are no routes. List the **in-app flows and states** touched by the diff (e.g. zip picker → store list → shop view → cart drawer → carts hub → checkout → success banner, or the Profile page). Each changed state needs coverage in the recording.

**Stripe caveat:** a full test-mode checkout (card `4242 4242 4242 4242`) only works when `.env` has Stripe test keys. Without keys, walk the flow up to the checkout button and note the limitation — do not present a failed Stripe redirect as the demo.

### 3. Main agent: start the recording

Run `RecordScreen` **START** yourself before handing off to the subagent. Do not let the subagent start any recorder. Keep this session open for the whole capture.

### 4. Subagent: drive the browser only

Launch the `browser-use` subagent (real desktop browser, `run_in_background: false`) with an explicit, ordered script. The subagent must:

1. Open a **real desktop Chrome window** (not headless) at http://127.0.0.1:5173.
2. Walk the flow deliberately, pausing ~1s on each meaningful state so the video is readable.
3. Return when done — it does **not** start, stop, or save any recording.

Give the subagent the exact steps and an explicit instruction not to record. Example prompt body:

```
Drive a REAL desktop Chrome window through this flow. Do NOT start ffmpeg,
RecordScreen, or any screen recorder — the main agent is already recording.
Steps: load http://127.0.0.1:5173, wait for the store list to render, open
GreenMart, add two items from the product grid, open the cart drawer via the
header cart badge, and confirm the subtotal updates. Pause ~1s per state so
each is clearly visible. Then return; leave the window open.
```

### 5. Main agent: save the recording

Once the subagent reports it finished the flow, run `RecordScreen` **SAVE** with a descriptive filename (e.g. `cart-drawer-promo-walkthrough.mp4`).

### 6. Verify the artifact before attaching

A saved file is **not** proof. File size and duration mean nothing on their own. Verify content:

- Extract frames at roughly **0s, 33%, 66%, and the end** (or use a video-review tool).
- Confirm **at least two frames differ** (the flow actually progressed) **and** the changed UI is visible (e.g. drawer open, discount line, order stepper).
- **Reject and re-record** if the clip is static, blank, shows only the VM desktop/error page, or is missing the feature.
- If video verification fails **twice**, fall back to screenshots (see below) — but only for static states; multi-step flows must still produce a working video.

### Screenshots — fallback / static states

For a static state, or as the fallback after two failed video verifications, capture a full-page screenshot of each changed state via the browser tooling (`browser_take_screenshot` with `fullPage: true`), one per changed state.

### 7. Attach the verified walkthrough

Attach the verified artifact in **two places**:

1. Embed the video (or screenshots) in the **PR description**.
2. Include the **same** video/screenshots in your **final reply** to the user — do not attach it to the PR only.

Only attach once verification (step 6) passes.

## Anti-patterns

- ❌ Letting the subagent run `ffmpeg`/`RecordScreen` — or running two recorders in parallel.
- ❌ Treating file size or duration as success without frame verification.
- ❌ `RecordScreen` over a headless Playwright run — records the empty VM desktop.
- ❌ Treating `npm run build` as verification for UI work.
- ❌ Recording before both servers respond (empty Vite error page on :5173).
- ❌ Attaching the walkthrough to the PR only and omitting it from the agent's final reply.
- ❌ Marking capture complete with a static, blank, or feature-missing clip.
