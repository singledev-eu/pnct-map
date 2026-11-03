// Shared "map settled" wait for the screenshot scripts (theme_shots, protected_shots, readme_shot).
//
// Not page.waitForFunction: when its predicate returns a Promise, Playwright awaits that Promise once
// and then judges the Promise object itself, which is always truthy. So a two-frame check written as
// `() => new Promise(...)` ran once and returned whatever it found (even false). This polls with
// page.evaluate, which awaits the Promise and returns its value, until the check passes.

/** The longest paint transition the app sets (drill.ts DURATION_3D, the slab rising) plus a margin. */
const FALLBACK_TRANSITION_MS = 1400 + 300;

/**
 * Resolves once the app has started and drawn in `scheme`, the overlays named in the hash (`pa=`)
 * are in the style, an open panel's protection section and concelho card have filled in, the camera is at rest, the map
 * (basemap included) is loaded, no MapLibre paint transition and no finite CSS animation or transition is running. Each check runs
 * two animation frames after the previous one ended (like settled() in tests/e2e/helpers.ts), with no
 * fixed sleeps. Returns the time it took in ms; throws, naming the condition still unmet, after
 * `timeout` ms.
 */
export async function waitForSettled(page, scheme, { timeout = 60_000 } = {}) {
  await page.evaluate(() => delete window.__settledSince);
  const start = Date.now();
  for (;;) {
    const unmet = await page.evaluate(
      ({ scheme, FALLBACK_TRANSITION_MS }) =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const map = window.pnctMap;
              if (document.body.dataset.ready !== "true") return resolve("app not ready (body data-ready)");
              if (document.body.dataset.mapTheme !== scheme) return resolve(`map not drawn in the ${scheme} theme (body data-map-theme)`);
              // main.ts sets data-overlays once the overlays' layers are in the style.
              const wanted = (new URLSearchParams(location.hash.slice(1)).get("pa") ?? "").split(",").filter(Boolean).sort().join(",");
              if ((document.body.dataset.overlays ?? "") !== wanted) return resolve(`overlays "${wanted}" not in the style yet`);
              if (document.querySelector('[data-testid="protection"]') && !document.querySelector('[data-testid="protection-summary"]')) return resolve("protection section not filled in");
              if (document.querySelector('[data-testid="concelho-card"][aria-busy]')) return resolve("concelho card still loading");
              if (!map || map.isMoving()) return resolve("camera moving");
              if (!map.loaded()) return resolve("map tiles or glyphs still loading");
              // Paint transitions (the 300 ms label/fill fade after a theme switch, the slab rising)
              // run after the camera stops and the tiles load. MapLibre's Style.hasTransitions() is
              // true while any layer, the light or the sky is mid-transition. Without it (an older
              // or newer MapLibre), fall back to the longest transition the app sets plus a margin.
              if (typeof map.style?.hasTransitions === "function") {
                if (map.style.hasTransitions()) return resolve("paint transition running");
              } else {
                const now = performance.now();
                window.__settledSince ??= now;
                if (now - window.__settledSince < FALLBACK_TRANSITION_MS) return resolve("waiting out paint transitions (fallback)");
              }
              const running = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
              resolve(running.length ? "CSS animation running" : "");
            }),
          ),
        ),
      { scheme, FALLBACK_TRANSITION_MS },
    );
    const elapsed = Date.now() - start;
    if (!unmet) return elapsed;
    if (elapsed > timeout) throw new Error(`map not settled after ${timeout / 1000} s: ${unmet}`);
  }
}
