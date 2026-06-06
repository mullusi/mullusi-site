# Mullu Eye Helper v3

Purpose: animated click-activated helper cursor for the Mullusi public homepage.
Governance scope: visible DOM inspection, contextual target summaries, safe local actions, risky-action confirmation, and optional same-origin backend inspection.
Dependencies: `mullu-eye-helper-v3.bundle.css`, `mullu-eye-helper-v3.bundle.js`, `mullu-eye-helper-v3.install.js`, and browser DOM APIs.
Invariants: no password values are read, forms are not submitted silently, risky actions require a second confirmation, and helper boot starts inactive.

## Behavior

1. Sleeping eye dock is visible in the lower-right viewport.
2. User clicks the dock to activate helper mode.
3. Eye cursor follows the pointer, blinks, breathes, tracks pointer position, and highlights the current DOM target.
4. User clicks a target to open the action panel.
5. Helper offers actions based on role: link, button, input, text, card, or section.
6. Safe actions execute from user gestures.
7. Risky actions require a second confirmation.
8. The last 20 user-triggered helper outcomes are retained as local receipts.
9. Each target packet includes structural confidence and evidence flags.
10. User may pin a target to freeze context while moving the pointer elsewhere.
11. User may copy the bounded target packet as JSON for debugging or backend inspection.
12. User may copy the bounded local receipt trace as JSON.
13. Keyboard focus updates the target lock while helper mode is active.
14. Alt+Enter opens the action panel for the current focused or pointed target.

## Allowed Actions

| Target | Actions |
|---|---|
| Link | open link, reveal target, explain target, copy visible text, copy packet, copy link |
| Button | click target, reveal target, explain target, copy visible text, copy packet |
| Input | focus field, reveal target, explain target, copy visible text, copy packet |
| Text/card/section | reveal target, explain target, copy visible text, copy packet |

## Risk Gate

The helper treats targets as risky when visible label, text, section text, or link text includes state-changing terms such as delete, remove, reset, submit, send, pay, buy, checkout, logout, disconnect, revoke, cancel, or publish.

Risky actions do not execute on first click. The panel rerenders with an explicit confirmation button.

## Animation Boundary

- Sleeping dock uses a slow breathe cycle, eyelid twitch, and hover/focus peek.
- Activation emits a short wake flash before the awake pulse settles.
- Active dock uses a stronger awake pulse.
- Cursor eyes blink and track bounded pointer movement through CSS variables.
- Idle active eyes run a bounded scan cycle after pointer movement settles.
- Keyboard target locks shift the highlight into a distinct focus expression.
- Open panels keep the eyes in an attended state until the panel closes.
- Risky targets shift the eyes and target highlight into a warning expression.
- Link, button, input, card, and section targets expose subtle role-specific expressions.
- Target highlight uses a quiet scan pulse.
- `prefers-reduced-motion: reduce` disables continuous animation while preserving helper function.

## Edge Handling

- The panel measures its rendered dimensions and flips away from viewport edges.
- Scroll, resize, and pointer-leave clear stale target highlights when the panel is closed.
- Escape closes the open panel first; Escape again deactivates helper mode.
- Keyboard focus can inspect visible focused controls without reading private values.
- Alt+Enter opens the action panel for the current target without triggering the target itself.
- Local receipts are bounded to 20 entries and expose only action, target id, role, selector, risk flag, result, timestamp, and visible label.
- Panel metadata shows `k`, target id, evidence source, and selector boundary for the current target.
- Executable actions re-resolve the selector lock before acting and block stale DOM targets.
- Low-confidence executable controls require confirmation even when their label is not state-changing.
- Pinned targets are re-resolved on pointer, scroll, and resize; stale pinned targets are cleared and recorded.
- Reveal target re-resolves the selector lock, scrolls the target to viewport center, and pulses the highlight.
- Copy packet exports the same bounded visible packet shape sent to the optional backend.
- Clipboard unavailability is reported explicitly and recorded as a failed action.

## Privacy Boundary

- Password and hidden input values are never read.
- Visible text copying is limited to rendered page text or same-origin link URLs.
- The helper does not submit forms directly.
- The optional backend endpoint receives a target packet, not private browser state.

## Optional Backend Contract

Configure the installer with an endpoint:

```js
MulluEyeHelper.install({
  endpoint: "/api/mullu/helper/inspect"
});
```

The frontend sends:

```json
{
  "type": "mullu.helper.inspect",
  "packet": {
    "role": "section",
    "targetId": "abc1234",
    "tag": "section",
    "label": "Symbolic Engine",
    "heading": "Symbolic Engine",
    "text": "Visible pointed text",
    "sectionText": "Larger surrounding section",
    "helperMetadata": "Site-native helper metadata",
    "href": "",
    "selector": "#symbolic-engine",
    "url": "https://mullusi.com/",
    "title": "Mullusi",
    "risky": false
  }
}
```

The backend may return:

```json
{
  "summary": "This section explains the governed state model.",
  "intent": "explain_section",
  "actions": [
    { "id": "explain", "label": "Explain" }
  ]
}
```

## Verification

Run:

```sh
node --check assets/helper/mullu-eye-helper-v3.bundle.js
node --check assets/helper/mullu-eye-helper-v3.install.js
npm.cmd run validate:site
```
