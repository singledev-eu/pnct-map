// Generates the social share image and the iOS home-screen icon:
//   public/og-image.png          1200×630, the country view with a title card
//   public/apple-touch-icon.png  180×180, opaque
// Usage: `npm run build && npm run preview` (in another shell), then `node scripts/og_image.mjs`.
// Rebuild afterwards so dist/ picks up the new images.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
mkdirSync(publicDir, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });

// ---- og-image.png ----------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto("http://localhost:4173/");
  await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.body.dataset.mapIdle === "true", null, { timeout: 60_000 });

  // Hide the UI chrome (keep the legend) and add the title card.
  await page.addStyleTag({
    content: `
      .toolbar, .maplibregl-ctrl-bottom-right, #status, #tooltip { display: none !important; }
      .og-card {
        position: absolute; z-index: 10; top: 24px; left: 24px;
        padding: 18px 26px 20px;
        background: #fff; border-radius: 14px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #14302d;
      }
      .og-card strong { display: block; font-size: 44px; line-height: 1.1; font-weight: 700; color: #0f8a7e; }
      .og-card span { display: block; margin-top: 6px; font-size: 20px; line-height: 1.3; color: #3b4a48; }
    `,
  });
  await page.evaluate(() => {
    const card = document.createElement("div");
    card.className = "og-card";
    const title = document.createElement("strong");
    title.textContent = "Mapa PNCT";
    const sub = document.createElement("span");
    sub.textContent = "Territórios de coesão territorial · Portugal continental";
    card.append(title, sub);
    document.body.append(card);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${publicDir}/og-image.png` });
  console.log(`${publicDir}/og-image.png`);
  await page.close();
}

// ---- apple-touch-icon.png --------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; padding: 0; background: #0f8a7e; }
    svg { display: block; }
  </style></head><body>
    <svg id="icon" xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <rect width="180" height="180" fill="#0f8a7e"/>
      <rect x="36" y="36" width="108" height="108" rx="27" fill="#ffffff" fill-opacity="0.22"/>
    </svg>
  </body></html>`);
  await page.locator("#icon").screenshot({ path: `${publicDir}/apple-touch-icon.png` });
  console.log(`${publicDir}/apple-touch-icon.png`);
  await page.close();
}

await browser.close();
