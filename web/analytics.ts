import type { HtmlTagDescriptor, Plugin } from "vite";

/**
 * Cloudflare Web Analytics (cookieless, no personal data): one beacon script, injected into
 * index.html at build time only when a site token is configured. The token comes from the
 * environment (CF_WEB_ANALYTICS_TOKEN, or web/.env.production.local, which is gitignored), never
 * from the code. Without it, the build has no analytics, which is the default and what tests use.
 *
 * What it can and cannot measure: page loads, referrers (e.g. facebook.com), countries, devices
 * and Core Web Vitals. Cloudflare does not record query strings, so utm_* values are not
 * reported, and its SPA mode doesn't support hash routing, so per-parish views (#… in the URL)
 * aren't either (README, "Analytics").
 */
export const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
// The site token (32 hex characters in the dashboard's snippet); checked loosely, so it can only be
// a plain token and never break out of the attribute.
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export function beaconTag(token: string | undefined): HtmlTagDescriptor | null {
  const t = token?.trim();
  if (!t) return null;
  if (!TOKEN.test(t)) throw new Error("CF_WEB_ANALYTICS_TOKEN must be the site token from the Cloudflare Web Analytics dashboard (letters and digits only)");
  // spa: false counts real page loads only (the app rewrites its URL with replaceState as you browse).
  return { tag: "script", attrs: { defer: true, src: BEACON_SRC, "data-cf-beacon": JSON.stringify({ token: t, spa: false }) }, injectTo: "body" };
}

export function cfWebAnalytics(token: string | undefined): Plugin {
  const tag = beaconTag(token);
  return {
    name: "pnct-cf-web-analytics",
    apply: "build",
    transformIndexHtml: () => (tag ? [tag] : []),
  };
}
