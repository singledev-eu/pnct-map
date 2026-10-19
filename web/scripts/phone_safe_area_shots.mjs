// iPhone-like phone shots for the focus-zoom / safe-area check (0.6.0), before and after a fix.
// Usage (preview server on :4173, or BASE=https://…): node scripts/phone_safe_area_shots.mjs <out-dir> <label>
// Files: <out-dir>/<label>-<view>.png
//
// Emulated: a 393×852 iPhone viewport with safe-area insets of 59 px (top: Dynamic Island) and
// 34 px (bottom: home indicator) through CDP Emulation.setSafeAreaInsetsOverride. Safari's floating
// toolbar itself can't be emulated. iOS Safari's focus zoom isn't emulated by Chromium either: when
// the focused field's computed font-size is under 16 px, the script reproduces it with the page
// scale Safari applies (16 / font-size, around the field), and keeps it after blur, as Safari does.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = process.env.BASE ?? "http://localhost:4173/";
const [out, label] = process.argv.slice(2);
if (!out || !label) throw new Error("usage: node scripts/phone_safe_area_shots.mjs <out-dir> <label>");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });

async function open(hash = "") {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "pt-PT" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  await page.goto(`${BASE}${hash}`);
  await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 60_000 });
  await waitForSettled(page, "light");
  return { context, page, cdp };
}

const shot = async (page, view) => {
  const path = `${out}/${label}-${view}.png`;
  await page.screenshot({ path });
  console.log(path);
};

// 1. Load, 2. search focused, 3. search left (blurred).
{
  const { context, page, cdp } = await open();
  await shot(page, "1-load");
  const input = page.locator("#search-input");
  await input.tap();
  const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  if (fontSize < 16) await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 16 / fontSize });
  await page.keyboard.type("Idanha");
  await shot(page, "2-search-focused");
  await page.locator("#map").tap({ position: { x: 300, y: 600 }, force: true });
  await input.evaluate((el) => el.blur());
  await shot(page, "3-search-left");
  console.log(`search font-size: ${fontSize}px${fontSize < 16 ? ` → Safari zooms ×${(16 / fontSize).toFixed(2)}` : " (no zoom)"}`);
  await context.close();
}

// 4. The concelho sheet at half and full height.
{
  const { context, page } = await open("#c=0505");
  await shot(page, "4-sheet-half");
  await page.getByTestId("sheet-handle").tap();
  await page.waitForFunction(() => document.getElementById("panel")?.dataset.sheet === "full");
  await page.waitForTimeout(400); // the sheet's 0.25 s transition (screenshot only)
  await shot(page, "5-sheet-full");
  await context.close();
}

await browser.close();
