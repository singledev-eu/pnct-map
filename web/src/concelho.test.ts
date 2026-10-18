import { describe, expect, it } from "vitest";
import DATA from "../data/concelhos.json";
import { issueUrl, signedPct, type ConcelhoData } from "./concelho";
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
