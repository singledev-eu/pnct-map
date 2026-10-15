// Renders the caption band, one transparent PNG per caption and the end card, at exact video pixels
// in Chromium (crisp text in the app's own font stack; this ffmpeg build has no drawtext anyway).
// Output: work/<format>/layers/{band,caption-N,endcard}.png, used by encode.mjs.
//
// Usage: node captions.mjs [--format 4x5|1x1]   (default: every format that has been recorded)
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { existsSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { CAPTIONS, COLORS, END_CARD, FORMATS } from "./storyboard.mjs";

const { values: args } = parseArgs({ options: { format: { type: "string" } } });
const work = (name) => new URL(`./work/${name}/`, import.meta.url).pathname;
const formats = args.format ? [args.format] : Object.keys(FORMATS).filter((name) => existsSync(`${work(name)}timeline.json`));
if (!formats.length) throw new Error("Nothing recorded yet: run node record.mjs first");

// The app's font stack (web/src/style.css).
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");

const page = (body, css) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
  ${css}
</style></head><body>${body}</body></html>`;

/** Band behind the captions: the app's light tint, a hairline to the app below. */
const bandHtml = (f) =>
  page("<div class=band></div>", `.band { width: ${f.width}px; height: ${f.band}px;
    background: linear-gradient(180deg, #ffffff 0%, ${COLORS.tint} 100%); border-bottom: 2px solid #d5e6e3; }`);

/** A teal pill centred in the band. Font size scales with the band, so it stays readable on a phone. */
const captionHtml = (f, text) => {
  const size = Math.round(f.band * 0.24);
  return page(
    `<div class=slot><div class=pill>${esc(text)}</div></div>`,
    `.slot { width: ${f.width}px; height: ${f.band}px; display: flex; align-items: center; justify-content: center; }
     .pill { max-width: ${f.width - 64}px; padding: ${Math.round(size * 0.36)}px ${Math.round(size * 0.85)}px;
       border-radius: ${Math.round(size * 1.4)}px; background: rgba(15, 138, 126, 0.94); color: #fff;
       font-size: ${size}px; font-weight: 650; line-height: 1.18; text-align: center; letter-spacing: -0.01em;
       box-shadow: 0 6px 18px rgba(11, 61, 57, 0.18); }`,
  );
};

/** End card: the URL, "free · open source", an unofficial note and the data credits. */
const endCardHtml = (f) => {
  const u = f.width / 1080;
  return page(
    `<div class=card>
      <div class=swatches><i class=full></i><i class=part></i><i class=none></i></div>
      <div class=title>${esc(END_CARD.title)}</div>
      <div class=subtitle>${esc(END_CARD.subtitle)}</div>
      <div class=note>${esc(END_CARD.note)}</div>
      <div class=credits>${esc(END_CARD.credits)}</div>
    </div>`,
    `.card { width: ${f.width}px; height: ${f.height}px; position: relative; display: flex; flex-direction: column;
       align-items: center; justify-content: center; text-align: center; color: #fff;
       background: radial-gradient(120% 80% at 50% 35%, ${COLORS.accent} 0%, ${COLORS.deep} 70%); }
     .swatches { display: flex; gap: ${18 * u}px; margin-bottom: ${54 * u}px; }
     .swatches i { width: ${64 * u}px; height: ${48 * u}px; border-radius: ${10 * u}px; border: ${3 * u}px solid rgba(255,255,255,.85); }
     .full { background: rgba(255,255,255,.85); }
     .part { background: repeating-linear-gradient(-45deg, rgba(255,255,255,.85) 0 ${5 * u}px, transparent ${5 * u}px ${15 * u}px); }
     .none { background: transparent; }
     .title { font-size: ${88 * u}px; font-weight: 750; letter-spacing: -0.02em; }
     .subtitle { margin-top: ${18 * u}px; font-size: ${50 * u}px; font-weight: 600; color: ${COLORS.tint}; }
     .note { margin-top: ${44 * u}px; font-size: ${32 * u}px; opacity: .8; }
     .credits { position: absolute; left: ${48 * u}px; right: ${48 * u}px; bottom: ${44 * u}px;
       font-size: ${21 * u}px; line-height: 1.45; opacity: .62; }`,
  );
};

const browser = await chromium.launch({ channel: "chromium" });
for (const name of formats) {
  const f = FORMATS[name];
  const out = `${work(name)}layers/`;
  mkdirSync(out, { recursive: true });
  const tab = await browser.newPage({ viewport: { width: f.width, height: f.height }, deviceScaleFactor: 1 });
  const shot = async (html, path, size) => {
    await tab.setContent(html);
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, ...size } });
  };
  await shot(bandHtml(f), `${out}band.png`, { width: f.width, height: f.band });
  for (const [i, c] of CAPTIONS.entries()) await shot(captionHtml(f, c.text), `${out}caption-${i + 1}.png`, { width: f.width, height: f.band });
  await shot(endCardHtml(f), `${out}endcard.png`, { width: f.width, height: f.height });
  await tab.close();
  console.log(`${name}: band, ${CAPTIONS.length} captions, end card → ${out}`);
}
await browser.close();
