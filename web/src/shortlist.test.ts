import { describe, expect, it } from "vitest";
import { loadShortlist, MAX_ITEMS, mergeCodes, parseCodes, saveShortlist, SHORTLIST_KEY, shareUrl } from "./shortlist";

const memory = () => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as Storage;
  return { storage: () => s, m };
};

describe("shortlist", () => {
  it("keeps valid, unique codes in order", () => {
    expect(parseCodes("140911,1409,abc,140911,12345,0211")).toEqual(["140911", "1409", "0211"]);
    expect(parseCodes(["150902", 7, null])).toEqual(["150902"]);
    expect(parseCodes(undefined)).toEqual([]);
    expect(parseCodes(Array.from({ length: 100 }, (_, i) => String(1000 + i)))).toHaveLength(MAX_ITEMS);
  });

  it("stores and loads, and survives broken or missing storage", () => {
    const { storage, m } = memory();
    saveShortlist(["140911", "0211"], storage);
    expect(JSON.parse(m.get(SHORTLIST_KEY)!)).toEqual(["140911", "0211"]);
    expect(loadShortlist(storage)).toEqual(["140911", "0211"]);
    saveShortlist([], storage);
    expect(m.has(SHORTLIST_KEY)).toBe(false);
    m.set(SHORTLIST_KEY, "{not json");
    expect(loadShortlist(storage)).toEqual([]);
    const broken = () => {
      throw new Error("blocked");
    };
    expect(loadShortlist(broken)).toEqual([]);
    expect(() => saveShortlist(["0211"], broken)).not.toThrow();
  });

  it("merges a shared list after the own one, without duplicates", () => {
    expect(mergeCodes(["0211", "140911"], ["140911", "1823"])).toEqual(["0211", "140911", "1823"]);
  });

  it("shares only the list", () => {
    expect(shareUrl(["140911", "0211"], "https://pnct.singledev.eu/")).toBe("https://pnct.singledev.eu/#list=140911,0211");
  });
});
