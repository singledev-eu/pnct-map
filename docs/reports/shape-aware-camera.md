# Shape-aware camera (0.2.3)

Branch `fix/shape-aware-camera`. Status: **on preview, awaiting your approval**. Nothing is merged, deployed to production or tagged, and the branch isn't pushed.

**Preview:**
- https://preview.pnct-map.pages.dev
- deployment https://5ce0d702.pnct-map.pages.dev

## What I found

- **The hook:** MapLibre 6.11.2 has a built-in hook, `map.setTransformConstrain`. 0.2.2 already uses it, and it runs on every camera change: drag, pinch, inertia, `easeTo`/`flyTo`, the hash.
- **The old rule** (`constrainView`):
  1. clamp the zoom;
  2. keep the viewport inside `maxBounds`, which is the min-zoom view, widened by up to 1.5° as the zoom rises. This rule pins the country view at min zoom, so every zoom-out ends there;
  3. clamp the centre per axis to the mainland bbox ± 0.25°. That is the rectangle whose corners cover Cádiz/Jerez and Galicia.
- **Focus mode and the phone legend** don't touch the camera.
- **The suggested 0.15–0.25° buffer can't pass your own test list:**
  - Badajoz is only **5.5 km** from the border (Vigo 22 km, Ourense 35 km).
  - Selection fits put the *map* centre up to 180 px east (desktop panel) or 150 px south (phone sheet) of the feature. At concelho zoom that's about 0.25°: the Elvas concelho fit is centred over Badajoz.
  - So any rule on the map centre either rejects Badajoz or breaks border fits. `camera.fits.test.ts` guards those fits.

## What I changed

**The outline:** `scripts/build_outline.py` (`make outline`, part of `make all`) builds it from CAOP 2025:
- mainland only, no islets;
- buffered **2 km** along the Spanish border and **20 km (~0.18°)** at sea. For the sea part, I took the 20 km buffer and removed everything within 20 km of the CAOP `Portugal#Espanha` border lines, so it never reaches Spain;
- simplified with a 1.5 km tolerance to **175 vertices**.

The output is `web/data/outline.json`, 3.3 KB. The build fails if the outline doesn't contain mainland or has more than 200 vertices.

**The rule:** the centre of the **visible area** stays inside the outline. The visible area is the map minus the toolbar and the side panel or bottom sheet: the same padding the fits use.
- Border selections are never moved: the fits test passes on all four screen sizes.
- At parish zooms, centring Badajoz is rejected.

**The algorithm** (`web/src/camera.ts`, `constrainView`):
- The zoom clamp and the `maxBounds` rule are unchanged.
- The outline is clipped to the `maxBounds` rule's box of allowed centres (Sutherland–Hodgman). A visible centre outside it moves to the nearest point, in Mercator, so also the nearest on screen.
- That makes the result a fixed point, so constraining again never moves it: no creep and no jitter.
- My first version alternated between the two rules. It drifted by up to 0.003° over 30 frames with the desktop panel open, about one zoom above min zoom. The unit test caught it.
- At min zoom, the box is still the single country-view point.

**The panel:** in `main.ts`, opening or closing the panel changes the visible area. If the camera then falls outside the outline, it eases back inside (300 ms).

**Bundle:** the main JS grows by **+4.6 KB raw, +2.2 KB gzip, +1.4 KB brotli** (1,053,670 → 1,058,233 bytes).

## Tests

| Suite | Local | Preview |
|---|---|---|
| pytest | 37 passed (+3: `test_outline.py`) | – |
| Vitest | 61 passed (camera tests rewritten: outline, clip, fixed point on a grid, cities) | – |
| Playwright | 46 passed, none flaky (+11: `camera-outline.spec.ts`) | **46/46** passed against https://preview.pnct-map.pages.dev |

`camera-outline.spec.ts` covers desktop 1440×900 and phone 390×844:
- Cádiz, Seville, Badajoz, Salamanca, Vigo and Ourense:
  - at **country zoom**, the camera stays at the country view;
  - at **parish zoom** (the first parish-level zoom and z12), they are clamped onto the outline;
  - a shared link `#map=12/38.88/-6.97` opens clamped.
- Sagres, Vila Real de Santo António, Elvas, Miranda do Douro, Bragança, Caminha and Cabo da Roca are centred exactly at z12 and z14.
- A mouse drag with inertia from Elvas toward Badajoz, and a CDP **touch fling** from Caminha toward Vigo: every rendered frame stays inside the outline, and the drag's resting camera is a fixed point.
- Elvas concelho with the panel open: the fit is clear of the panel, and closing the panel eases the camera back inside.

The existing specs (camera-center, zoom-levels, legend, glyphs) pass unchanged. I only reworded the camera-center header comment: its 0.2.2 box still holds as an outer bound.

## Caveats

- **The sea margin shrinks near the borders.** It goes from 20 km down to 2 km within 20 km of the Minho and Guadiana mouths, so you can pan less far out to sea off Caminha and Vila Real de Santo António. Both towns can still be centred.
- **The rule is on the visible area, not the map centre.** With the panel or sheet open, the map's geometric centre can sit over Spain: up to ~180 px east on desktop, or ~150 px south on phones.
- **Closing the panel can move the camera.** If you had panned to the edge with the panel open, closing it eases the camera back over Portugal (300 ms). On your phone, worth checking: close the bottom sheet at the eastern border and see whether this feels right.
- **Clipping near min zoom.** Between min zoom and about one zoom above it, the `maxBounds` rule still dominates, as before. Clipping a concave outline can join pieces along the box edge, so the centre may briefly sit slightly outside the outline there. It's still a fixed point, with no jitter.
- **Desktop-only Playwright browser:** the touch fling is emulated through CDP in Chromium, not a real phone.
