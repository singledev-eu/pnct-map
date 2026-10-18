// Shared "map settled" wait for the screenshot scripts (theme_shots, protected_shots, readme_shot).
//
// Not page.waitForFunction: when its predicate returns a Promise, Playwright awaits that Promise once
// and then judges the Promise object itself, which is always truthy. So a two-frame check written as
// `() => new Promise(...)` ran once and returned whatever it found (even false). This polls with
// page.evaluate, which awaits the Promise and returns its value, until the check passes.

/**
 * Resolves once the app has started and drawn in `scheme`, the overlays named in the hash (`pa=`)
 * are in the style, an open panel's protection section has filled in, the camera is at rest, the map
 * (basemap included) is loaded and no finite CSS animation or transition is running. Each check runs
 * two animation frames after the previous one ended (like settled() in tests/e2e/helpers.ts), with no
 * fixed sleeps. Returns the time it took in ms; throws, naming the condition still unmet, after
 * `timeout` ms.
 */
export async function waitForSettled(page, scheme, { timeout = 60_000 } = {}) {
  const start = Date.now();
  for (;;) {
    const unmet = await page.evaluate(
      (scheme) =>
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
              if (!map || map.isMoving()) return resolve("camera moving");
              if (!map.loaded()) return resolve("map tiles or glyphs still loading");
              const running = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
              resolve(running.length ? "CSS animation running" : "");
            }),
          ),
        ),
      scheme,
    );
    const elapsed = Date.now() - start;
    if (!unmet) return elapsed;
    if (elapsed > timeout) throw new Error(`map not settled after ${timeout / 1000} s: ${unmet}`);
  }
}
