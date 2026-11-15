import { describe, expect, it } from "vitest";
import headers from "../public/_headers?raw";
import { BEACON_SRC, beaconTag, cfWebAnalytics } from "../analytics";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("Cloudflare Web Analytics", () => {
  it("adds nothing without a token (the default build and every test build)", () => {
    expect(beaconTag(undefined)).toBeNull();
    expect(beaconTag("  ")).toBeNull();
  });

  it("injects one deferred beacon with the token from config, SPA mode off", () => {
    const tag = beaconTag(` ${TOKEN} `)!;
    expect(tag.attrs).toMatchObject({ defer: true, src: BEACON_SRC });
    expect(JSON.parse(String(tag.attrs!["data-cf-beacon"]))).toEqual({ token: TOKEN, spa: false });
    const plugin = cfWebAnalytics(TOKEN);
    expect(plugin.apply).toBe("build");
  });

  it("refuses something that isn't a site token", () => {
    expect(() => beaconTag('abc"}<script>')).toThrow(/site token/);
    expect(() => beaconTag("short")).toThrow(/site token/);
  });

  it("is allowed by the CSP: the beacon's script origin and its reporting endpoint", () => {
    expect(headers).toMatch(/script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
    expect(headers).toMatch(/connect-src [^;]*https:\/\/cloudflareinsights\.com/);
  });

  it("never has a token in the repo's code", async () => {
    const config = await import("../vite.config.ts?raw");
    expect(String(config.default)).not.toMatch(/[0-9a-f]{32}/i);
  });
});
