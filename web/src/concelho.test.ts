import { describe, expect, it } from "vitest";
import DATA from "../data/concelhos.json";
import { ageingHelpText, ageingText, issueUrl, signedPct, type ConcelhoData } from "./concelho";
import { tc } from "./strings";

const data = DATA as unknown as ConcelhoData;
const IDANHA = { code: "0505", name: "Idanha-a-Nova" };

describe("concelhos.json", () => {
  it("covers the 278 mainland concelhos with every population field", () => {
    const entries = Object.entries(data.concelhos);
    expect(entries).toHaveLength(278);
    for (const [dico, c] of entries) {
      expect(dico).toMatch(/^\d{4}$/);
      for (const key of ["population", "population_2011", "population_2021", "census_change", "density", "ageing_index"] as const) expect(c[key], `${dico} ${key}`).not.toBeNull();
    }
  });

  it("references Portugal's ageing index, from the same estimates year", () => {
    expect(data.national.ageing_index).toBeGreaterThan(100);
    expect(data.estimate_year).toBeGreaterThanOrEqual(2021);
    expect(data.snit_url).toBe("https://snit-mais.dgterritorio.gov.pt/portalsnit/");
  });

  it("ships contacts without the curators' notes", () => {
    const curated = Object.values(data.concelhos).filter((c) => c.contacts);
    expect(curated.length).toBeGreaterThan(0);
    for (const c of curated) expect(Object.keys(c.contacts!).sort()).toEqual(["as_of", "email", "pdm_url", "phone", "urbanism_url", "website"]);
  });
});

describe("signedPct", () => {
  it("uses a real minus sign and one decimal", () => {
    expect(signedPct(-14)).toBe("−14.0%");
    expect(signedPct(3.14)).toBe("+3.1%");
    expect(signedPct(0)).toBe("0.0%");
  });
});

describe("ageing index as a ratio", () => {
  it("shows index / 100 with one decimal, against Portugal", () => {
    expect(ageingText(417.9, 188.8)).toBe("4.2 older people (65+) per child (Portugal: 1.9)");
    expect(ageingHelpText(417.9, 188.8)).toBe("Ageing index 418 (Portugal: 189): people aged 65 and over per 100 children under 15. Source: INE.");
  });

  it("reads naturally below 1 (fewer older people than children) and at exactly 1", () => {
    expect(ageingText(80, 188.8)).toBe("0.8 older people (65+) per child (Portugal: 1.9)");
    expect(ageingText(100, 188.8)).toBe("1.0 older people (65+) per child (Portugal: 1.9)");
  });

  it("covers the real range in the data", () => {
    // 2025: Montijo 1.1 (111.3) to Vinhais 6.9 (687.0), none below 1. A sanity range, so a refresh can move it.
    const ratios = Object.values(data.concelhos).map((c) => c.ageing_index! / 100);
    expect(Math.min(...ratios)).toBeGreaterThan(0.5);
    expect(Math.max(...ratios)).toBeLessThan(10);
    expect(ageingText(data.national.ageing_index, data.national.ageing_index)).toMatch(/^1\.9 older people/);
  });
});

describe("issueUrl", () => {
  const url = new URL(issueUrl(data.issues_url, IDANHA, data.concelhos["0505"], data.estimate_year));

  it("opens a new issue in the repo with the data label", () => {
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/singledev-eu/pnct-map/issues/new");
    expect(url.searchParams.get("labels")).toBe("data");
    expect(url.searchParams.get("title")).toBe("Outdated info: Idanha-a-Nova (0505)");
  });

  it("pre-fills the DICO, the current values, the as_of date and the question", () => {
    const body = url.searchParams.get("body")!;
    const c = data.concelhos["0505"];
    expect(body).toContain("DICO 0505");
    expect(body).toContain(`Email: ${c.contacts!.email}`);
    expect(body).toContain(`PDM page: ${c.contacts!.pdm_url}`);
    expect(body).toContain(`Population ${data.estimate_year}: ${c.population}`);
    expect(body).toContain(`checked ${c.contacts!.as_of}`);
    expect(body).toContain("What changed?");
  });

  it("works for a concelho without contacts or data", () => {
    const body = new URL(issueUrl(data.issues_url, { code: "9999", name: "X" }, undefined, 2025)).searchParams.get("body")!;
    expect(body).toContain(`Email: ${tc.missing}`);
    expect(body).toContain(`checked ${tc.missing}`);
  });
});
