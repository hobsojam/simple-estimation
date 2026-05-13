# Accessibility Guidelines for Claude

This project targets **WCAG 2.1 Level AA** (also satisfying BITV 2.0 / EU Web Accessibility Directive). These rules apply whenever you touch any frontend file.

## Non-negotiable rules

- **Every interactive element must be keyboard-operable.** Buttons, links, form controls, and custom widgets must all be reachable and activatable with Tab/Enter/Space. Drag-and-drop boards must have a keyboard alternative (currently Enter/Space cycling via `onItemKeydown`).
- **No colour may be the sole means of conveying information.** Always pair colour with text or icons.
- **All form inputs must have a programmatically associated label** — either a `<label for="...">`, `aria-label`, or `aria-labelledby`. Implicit label wrapping (`<label><input></label>`) is acceptable but verify it works across screen readers.
- **Error messages must be announced.** Use `role="alert"` (implies `aria-live="assertive"`) for errors that appear dynamically. Use `aria-live="polite"` for status updates that do not require immediate attention.
- **Focus must be managed on dynamic content.** When a modal, inline form, or panel opens programmatically, move focus into it. When it closes, return focus to the element that triggered it (see `RoomList.svelte` for the pattern).
- **Never remove the visible focus ring** without providing an equivalent. Do not write `outline: none` or `outline: 0` without a replacement.

## ARIA patterns in use

| Component | Pattern |
|---|---|
| `JoinForm` tabs | `role="tablist"` / `role="tab"` / `role="tabpanel"` with arrow-key navigation |
| Drag-and-drop item cards | `role="button"` + `tabindex="0"` + `onkeydown` cycling |
| Error messages | `role="alert"` |
| Vote count, move announcements | `aria-live="polite"` + `aria-atomic="true"` |
| RoomList inline confirm | Focus moved in on open (`tick()` + `querySelector`), returned on close |

## Colour contrast

All text must meet the WCAG AA contrast minimums:
- **Normal text** (< 18 pt / < 14 pt bold): **4.5 : 1** against its background
- **Large text** (≥ 18 pt or ≥ 14 pt bold): **3 : 1**

### Approved secondary-text colours

| Use | Colour | Contrast on `#f8fafc` (body bg) |
|---|---|---|
| Muted / secondary text | `#4b5563` | ≈ 7 : 1 ✓ |
| Faint labels, column headers | `#4b5563` | ≈ 7 : 1 ✓ |
| Room ID, monospace metadata | `#4b5563` | ≈ 7 : 1 ✓ |

**Do not use** `#888`, `#767676`, `#6b7280`, or `#9ca3af` for text — all fail AA at normal text size on the app's `#f8fafc` body background. (`#767676` is 4.54:1 on pure white but only 4.34:1 on `#f8fafc`.)

## Testing

### Automated (E2E)
`e2e/tests/accessibility.spec.js` runs axe-core against the home page and an active room using `@axe-core/playwright`. These tests run as part of the E2E suite:

```bash
cd client && npm run build
cd e2e && npm test
```

If you introduce a new page state or major new component, add an axe assertion for it.

### Manual checklist (before each PR touching UI)
- [ ] Tab through the entire page — every interactive element is reachable and has a visible focus indicator
- [ ] Activate all interactive elements with Enter / Space only
- [ ] Verify no colour-only information (e.g. voted state uses both colour and a ✓ symbol)
- [ ] Check new text colours pass contrast with `https://webaim.org/resources/contrastchecker/`

### Screen reader smoke test (before releases)
- NVDA + Firefox on Windows, or VoiceOver + Safari on macOS
- Create a room, join, cast a vote — verify announcements are meaningful
