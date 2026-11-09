# Visual polish pass

Branch `feat/visual-polish` (from `main` d1112e2), one commit per item. Not merged into `main`, not in production.

- **Tests:** pytest 131, Vitest 216 and e2e 164 passed with no flaky tests (the run made by `npm run deploy:preview`; the 164 include the 11 new tests in `polish.spec.ts`). `tsc --noEmit` and the build pass. The project has no separate lint step.
- **Preview:** deployed to https://preview.pnct-map.pages.dev (https://50657df8.pnct-map.pages.dev). Production is untouched.
- **No new dependencies.** No data, URL/hash or link changes; the link snapshot is at 0 differences.
- **Shots:** `.artifacts/polish/before/` and `.artifacts/polish/after/` (62 each: 375, 768 and 1440 px wide, light and dark, PT), from the new `web/scripts/polish_shots.mjs`.

## What changed, per item

### 1. Site identity (7fc5367, ca75e17)

- A "Mapa PNCT" chip, the page's `<h1>` (there was none), sits left of the search box at every width. The name is the same in both languages.
- On a first visit a line under the toolbar says what the shaded parishes are, with a "Sobre"/"About" link and a × button. The text is the About dialog's own first sentence (`ui.about.intro`), so there is no new copy except the × button's name.
- Dismissal is kept in localStorage (`pnct-map:intro`), read and written inside try/catch. Without storage the intro still dismisses for that page.
- Files: `web/index.html`, `web/src/intro.ts` (new), `web/src/main.ts`, `web/src/strings*.ts` (`siteName`, `introDismiss`), `web/src/style.css`.

### 2. Dark theme, non-PNCT areas (b49d276)

- Non-PNCT concelhos and parishes were drawn at 3.5% opacity in both themes. The palette now carries that opacity: dark is 30% (`#94a3b8` over the basemap gives `#353a40`), light stays 3.5%.
- The legend swatch reads the same value through a new `--map-other-fill` token.
- `theme.test.ts` checks the token against the palette, and that the dark fill is a step above the basemap and apart from the PNCT teal.
- Files: `web/src/theme.ts`, `web/src/layers.ts`, `web/src/style.css`, `web/src/theme.test.ts`.

### 3. Label collisions (cee2bae)

- A concelho seat is now drawn whole (dot and name) or not at all. The clearance around its dot is 20 px at zoom 7 and 2 px at zoom 10, so seats thin out at mid zoom and fill in as you zoom.
- Priority: district capitals first (always drawn), then the seat of the selected concelho (always drawn, in a new `city-selected` layer), then the other seats.
- Both themes use the same layers.
- Files: `web/src/cities.ts`, `web/src/layers.ts`, `web/src/main.ts`, and the layer-order expectations in `cities.test.ts`, `drill.test.ts`, `protected.test.ts`, `tests/e2e/cities.spec.ts`.

### 4. Legend panel (fe55630)

- The legend background is opaque in both themes (`--legend-bg` was 94%). The edge pointers to off-screen towns were translucent too and got the same fix.
- File: `web/src/style.css`.

### 5. Detail sheet stats (8786463)

- População and Habitação e rendimentos are stat tiles: the number large, what it counts, its year, and a difference from Portugal where a national figure exists.
- The difference shows Portugal's value too, so nothing the sentences said is lost: "−80% vs. Portugal (2 076 €/m²)". It is a whole percentage computed from the two figures shown.
- Tiles with a difference: ageing ratio, sale price, declared income, monthly earnings. Population, Census change and density have no national figure in `concelhos.json`, so they have none.
- Two columns in the desktop panel and the phone sheet. The source lines and the ageing ⓘ disclosure are kept; the ⓘ also has a tooltip now.
- A missing value is still "—" with "não disponível", and no difference.
- The seven sentence strings were replaced by tile labels in PT and EN; `docs/i18n-glossary.md` has the two new terms.
- Files: `web/src/concelho.ts`, `web/src/strings*.ts`, `web/src/style.css`, `web/src/concelho.test.ts`, `tests/e2e/concelho-card.spec.ts`, `tests/e2e/i18n-theme.spec.ts`.

### 6. Selection highlight (50aa512)

- The outline was not dashed. The selected concelho's outline faded out past the concelho zoom level, which left only the 1 px lines of its parishes.
- With 3D off, the selected concelho now keeps a solid 3 px outline at every zoom, and the selected parish has the same width.
- With 3D off, fills outside the selection drop to 45% of their opacity. The selection, the parishes of the selected concelho and the hovered feature keep theirs.
- With 3D on nothing changes: the slab's rim is the outline and the veil dims the map.
- Files: `web/src/layers.ts`, `web/src/theme.ts`, `web/src/main.ts`, `web/src/layers.test.ts` (new).

### 7. Controls consistency (68e91c4)

- **District dropdown:** same padding, border, hover and focus ring as the search field, with a caret in the text colour instead of the native arrow.
- **Só PNCT:** a switch chip. The checkbox keeps its id and is now `role="switch"`, covering the whole chip. Off is an outlined track; on is a filled accent track and a tinted chip.
- **Bottom bar:** language is a segmented choice (current one: soft tint with an accent underline), theme is a round icon button, 3D is a pill switch (solid accent with a lit dot when on), with dividers between the three.
- **Sheet header:** the © button's accessible name and tooltip are now "Mostrar os créditos do mapa e as fontes dos dados" / "Show map credits and data sources". The close button got a tooltip. The star already had both ("Adicionar aos favoritos" / "Remover dos favoritos"). All three got a visible focus ring.
- Files: `web/index.html`, `web/src/controls.ts`, `web/src/panel.ts`, `web/src/strings*.ts`, `web/src/style.css`, `tests/e2e/bottom-sheet.spec.ts`.

### 8. Dark theme at close zoom (3ce3442)

- Parish border width now grows with zoom in both themes: 0.3 px at zoom 8, 0.9 at 11, 1.4 at 13, 2 at 15 (it stopped at 0.8 px).
- In dark the borders are a pale teal (`#b5d8d2`) at 70% instead of grey at 45%. Light keeps its grey at 45%.
- Files: `web/src/theme.ts`, `web/src/layers.ts`, `web/src/style.css`, `web/src/layers.test.ts`.

### Also

- `web/scripts/polish_shots.mjs` (1a6cea2) and `web/tests/e2e/polish.spec.ts`, with a line each in `CLAUDE.md`.

## Skipped or done differently

- **Item 3, "smaller seats at closer zoom":** `cities.json` has only name, DICO and a capital flag, and the brief said not to change data. So which non-capital seats show first is decided by collision order, not town size. Ranking by population would need a population field added to `cities.json` by the pipeline.
- **Item 6, outline colour:** the UI accent (`#0f766e`) is nearly the PNCT fill colour, so an outline in it would not show. Light keeps the deep teal `#0b3d39`; dark uses `--accent-strong` (`#8ae6d8`).
- **Item 6, 3D:** the dimming and the all-zoom concelho outline apply only with 3D off, since 3D already has the veil and the rim.
- **Item 5, PT wording:** the difference reads "vs. Portugal" in both languages, as in the brief's example.
- **Item 1, "one line":** the intro is one line at 1440 px and wraps to two or three lines at 375 px.
- **Item 2, light theme:** unchanged, as the brief names only dark.
- **kiro-cli:** not used. Every item edits `style.css` and the strings files, so parallel edits would have collided with one commit per item.

## Constraints

- **Contrast**, computed from the theme tokens, light / dark:
  - chip text 15.8 / 13.3
  - intro link 5.5 / 7.8
  - intro × and 3D off 5.5 / 6.9
  - switch-on label and active language 6.7 / 8.3
  - inactive language 5.0 / 5.8
  - 3D on 5.5 / 7.8
  - tile number 14.4 / 11.3
  - tile year and difference 5.0 / 5.8
- **Keyboard:** the intro's link and × are buttons; the switch is a native checkbox (Space toggles); the settings buttons are unchanged. All have a focus ring. Existing aria attributes are kept.
- **Widths:** checked at 375, 768 and 1440 px in light and dark from the after shots.

## Known side effects

- The intro shows on every first visit, so screenshot scripts that start from an empty profile (`readme_shot.mjs`, `og_image.mjs`, the other review shots) now capture it unless they set `pnct-map:intro` to `dismissed` first, as `polish_shots.mjs` does.
- At 375 px the intro covers the top of the map (Viana do Castelo to Bragança) until dismissed.

## How to verify

Run `cd web && npm run dev`, or open the preview.

1. **Identity:** open in a private window. The chip and the intro show. Click "Sobre" (About opens), then × (intro goes). Reload: the chip stays, the intro does not.
2. **Dark non-PNCT:** set the theme to dark at the country view. The Lisbon–Porto coast is a grey strip apart from the sea, and the "Fora do PNCT" swatch matches it.
3. **Labels:** open `#map=8/40.35/-7.75`. Tábua, Oliveira do Hospital and Belmonte don't touch; zoom to 10 and more seats appear, each with its dot. Check both themes.
4. **Legend:** pan so labels pass under the legend. None show through.
5. **Tiles:** open `#c=0505`. Two columns of tiles; "−80% vs. Portugal (2 076 €/m²)" on the sale price; the ⓘ on the ageing tile opens with Enter. Repeat at 375 px.
6. **Selection:** turn 3D off and open `#c=0505`. A solid 3 px outline around the concelho, the rest dimmed. Click a parish: same. Close the panel: the map is back to normal.
7. **Controls:** Tab through the toolbar. The dropdown and the search field look alike; Space flips "Só PNCT". In the legend header an active language (tint and underline) and an active 3D (solid pill) look different. On a phone, long-press or inspect the ©, ☆ and × in the sheet header for their names.
8. **Dark close zoom:** open `#map=11.5/40.36/-7.86` in dark. Each parish has a visible border.
