# Concelho card: phone sheet fixes and the ageing ratio

2026-10-18. Branch `feat/concelho-card`, commits `8a5ba0e` (sheet, ageing ratio), `e8bbd6e` (contacts tooling) and `af3ba0a` (contacts batch 1). Not merged.

- **Preview:** https://preview.pnct-map.pages.dev (this deploy: https://1c516e2c.pnct-map.pages.dev)
- **Contacts in this build:** 35 of 185 PNCT concelhos (the sample plus batch 1). Batch 2 is running.

## 1. Bottom sheet drag (`web/src/sheet.ts`)

- **Real handle:** the CSS-only grip is now a `<button>` (a full-width 24 px strip with the grip in the middle).
  - Drag the handle **or the header** up: the sheet snaps to ~90vh.
  - From 90vh, drag down: back to half. A long drag (over half the screen) closes it.
  - From half, drag down: closes. It slides out, then clears the selection, like ×.
  - Thresholds are 60 px or a 0.5 px/ms fling; shorter or slower drags snap back.
- **× is unchanged.** The ⓘ and × buttons in the header keep their taps; a drag never starts on them.
- **Keyboard and screen readers:** the handle is focusable. Enter/Space toggles half/full. `aria-expanded` and `aria-label` ("Expand panel" / "Collapse panel") follow the state.
- **Reduced motion:** no transitions; snaps and closing happen at once.
- **Both sheets:** it's one panel component, so the concelho and parish sheets behave the same. Choosing another parish or concelho inside an open sheet keeps its height; a closed sheet opens at half.
- **Desktop:** unchanged. The handle and ⓘ are hidden, and the side panel is as before.

## 2. Phone sheet space

- **Credits:** the three-line credit footer now sits behind a compact **ⓘ** in the sheet header, next to ×. One tap shows the full credit line (all links) under the header; another hides it. It's the same pattern as MapLibre's compact attribution, which the sheet covers. The credits stay complete, one tap away.
- **More room for content:** the body now reaches the bottom edge of the sheet. The Population source line, cut in half before, is fully visible, and the last line of any panel scrolls fully into view (tested).

## 3. Ageing index as a ratio

- **Main line:** "**4.2 older people (65+) per child (Portugal: 1.9)**". The ratio is index / 100 with one decimal, via `Intl.NumberFormat`. Portugal's value comes from the same field (188.8 → 1.9).
- **ⓘ text:** "Ageing index 418 (Portugal: 189): people aged 65 and over per 100 children under 15. Source: INE."
- **Real range, 2025, all 278 concelhos:**
  - min **Montijo 111.3 → 1.1**;
  - max **Vinhais 687.0 → 6.9**;
  - **none below 100**.

  The wording still reads naturally below 1 ("0.8 older people (65+) per child"); a unit test covers 0.8 and 1.0.
- Strings are in `web/src/strings.ts` (`tc.ageing`, `tc.ageingHelp`). The ⓘ's accessible name is now "About this figure (ageing index)".

## Before / after (phone 375×667, iPhone-like; before from the previous preview, after from this one)

| | Dark | Light |
|---|---|---|
| Concelho sheet, before vs after | `docs/screenshots/sheet/phone-dark-concelho-before-after.jpg` | `docs/screenshots/sheet/phone-light-concelho-before-after.jpg` |
| Parish sheet, before vs after | `docs/screenshots/sheet/phone-dark-parish-before-after.jpg` | `docs/screenshots/sheet/phone-light-parish-before-after.jpg` |
| Half / full / credits open | `docs/screenshots/sheet/phone-dark-sheet-states.jpg` | `docs/screenshots/sheet/phone-light-sheet-states.jpg` |

## Tests

`npm run deploy:preview`, all green, 0 flaky:

| Suite | Result | What's new |
|---|---|---|
| pytest | 104 passed, 1 xfailed | The strict xfail "every PNCT concelho is curated" comes off for the 0.5.0 RC |
| Vitest | 94 passed | +3: the ageing ratio, below-1 wording, real range |
| Playwright | 86 passed | +6 in `bottom-sheet.spec.ts` |

The new bottom-sheet e2e runs on a 375 px phone, with touch drags sent as CDP touch events:
- drag up to ~90vh, down to half, down to close (the hash is cleared);
- a header drag;
- a short drag snapping back;
- × still closing;
- keyboard Enter/Space and a tap on the handle;
- reduced motion;
- the credits behind the ⓘ, with the content scrolling clear to the bottom;
- desktop unchanged.

Three existing specs (`mobile-attribution`, `smoke`, `protected-areas`) now tap the ⓘ before checking the sheet credit.

## Check on the phone (Safari)

1. **Drag the handle and the header** up and down on both sheets (`#c=0505`, `#f=050505`). Check that dragging the header doesn't scroll the page or trigger Safari's pull-to-refresh. Both have `touch-action: none`; the body still scrolls normally.
2. **Flick down from half** to close.
3. **Tap the ⓘ** for the credits, then tap it again.
4. **Turn on Reduce Motion** (Settings → Accessibility → Motion): the snaps should be instant.

## Curation

Batch 1 is reviewed and committed (`af3ba0a`):

| | |
|---|---|
| Rows | 25, filled by kiro |
| Corrected in review | 1: Póvoa de Lanhoso's PDM link was the 2.ª revisão consultation; now the Geoportal page with the PDM in force |
| Spot-checked | 5/25 against the live sites: 4 confirmed, 1 corrected |
| Validator | 0 problems, 3 warnings (mailboxes on another of the câmara's domains) |

Following kiro's findings, the validator now:
- treats an email on another of the câmara's domains as a warning;
- rejects free-mail domains;
- no longer flags `cm.`/`mun.`/`camara.` prefixes as personal.

Batch 2 is running.
