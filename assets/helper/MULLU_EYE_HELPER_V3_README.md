# Mullu Eye Helper v3

Purpose: click-activated helper cursor for the Mullusi public homepage.
Governance scope: visible DOM inspection, contextual target summaries, safe local actions, risky-action confirmation, and optional same-origin backend inspection.
Dependencies: `mullu-eye-helper-v3.bundle.css`, `mullu-eye-helper-v3.bundle.js`, `mullu-eye-helper-v3.install.js`, and browser DOM APIs.
Invariants: no password values are read, forms are not submitted silently, risky actions require a second confirmation, and helper boot starts inactive.

## Behavior

1. Sleeping eye dock is visible in the lower-right viewport.
2. User clicks the dock to activate helper mode.
3. Eye cursor follows the pointer and highlights the current DOM target.
4. User clicks a target to open the action panel.
5. Helper offers actions based on role: link, button, input, text, card, or section.
6. Safe actions execute from user gestures.
7. Risky actions require a second confirmation.

## Allowed Actions

| Target | Actions |
|---|---|
| Link | open link, explain target, copy visible text, copy link |
| Button | click target, explain target, copy visible text |
| Input | focus field, explain target, copy visible text |
| Text/card/section | explain target, copy visible text |

## Risk Gate

The helper treats targets as risky when visible label, text, section text, or link text includes state-changing terms such as delete, remove, reset, submit, send, pay, buy, checkout, logout, disconnect, revoke, cancel, or publish.

Risky actions do not execute on first click. The panel rerenders with an explicit confirmation button.

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
