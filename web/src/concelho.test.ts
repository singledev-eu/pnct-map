import { describe, expect, it } from "vitest";
import DATA from "../data/concelhos.json";
import { ageingHelpText, ageingRatio, deltaPct, domainOf, issueUrl, signedPct, type ConcelhoData } from "./concelho";
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
    for (const c of curated) expect(Object.keys(c.contacts!).sort()).toEqual(["as_of", "email", "pdm_status", "pdm_url", "phone", "urbanism_url", "website"]);
  });
});

describe("pdm_status", () => {
  it("comes from the review: 24 unclear, none without a link, all others in force", () => {
    const curated = Object.entries(data.concelhos).filter(([, c]) => c.contacts);
    expect(curated.filter(([, c]) => c.contacts!.pdm_status === "unclear")).toHaveLength(24);
    for (const [, c] of curated) expect(c.contacts!.pdm_status === null).toBe(c.contacts!.pdm_url === null);
    expect(data.concelhos["1210"].contacts!.pdm_status).toBe("unclear"); // Marvão
  });

  it("is in the report-outdated-info body", () => {
    const body = new URL(issueUrl(data.issues_url, { code: "1210", name: "Marvão" }, data.concelhos["1210"], data.estimate_year)).searchParams.get("body")!;
    expect(body).toContain("PDM status: unclear");
  });
});

describe("housing and income (card v2)", () => {
  it("has the three fields for every concelho, with Portugal's values and the periods", () => {
    for (const [dico, c] of Object.entries(data.concelhos)) for (const key of ["sale_price_m2", "income_per_taxpayer", "monthly_earnings"] as const) expect(c[key], `${dico} ${key}`).toBeGreaterThan(0);
    expect(data.national.sale_price_m2).toBeGreaterThan(0);
    expect(Object.keys(data.periods!).sort()).toEqual(["income_per_taxpayer", "monthly_earnings", "sale_price_m2"]);
  });

  it("states the difference from Portugal, starting with the percentage", () => {
    expect(tc.vsPortugal("−80%", "€2,076/m²")).toBe("−80% vs. Portugal (€2,076/m²)");
  });
});

describe("deltaPct", () => {
  it("is the whole signed percentage of the national figure, with a real minus sign", () => {
    expect(deltaPct(412, 2076)).toBe("−80%");
    expect(deltaPct(417.9, 188.8)).toBe("+121%");
    expect(deltaPct(2076, 2076)).toBe("0%");
    expect(deltaPct(2070, 2076)).toBe("0%"); // −0.3% rounds to zero, without a sign
  });

  it("matches the two figures it compares, for every concelho", () => {
    for (const c of Object.values(data.concelhos)) {
      const pct = Number(deltaPct(c.sale_price_m2!, data.national.sale_price_m2!).replace("−", "-").replace(/[%,+]/g, ""));
      expect(pct).toBeCloseTo((c.sale_price_m2! / data.national.sale_price_m2! - 1) * 100, -0.31); // within half a point
    }
  });
});

describe("signedPct", () => {
  it("uses a real minus sign and one decimal", () => {
    expect(signedPct(-14)).toBe("−14.0%");
    expect(signedPct(3.14)).toBe("+3.1%");
    expect(signedPct(0)).toBe("0.0%");
  });
});

describe("domainOf", () => {
  it("shows the câmara site as its domain, without www.", () => {
    expect(domainOf("https://www.cm-idanhanova.pt/")).toBe("cm-idanhanova.pt");
    expect(domainOf("https://cm-alcoutim.pt/")).toBe("cm-alcoutim.pt");
    expect(domainOf("https://www.mun-aljustrel.pt/")).toBe("mun-aljustrel.pt");
  });
});

describe("ageing index as a ratio", () => {
  it("shows index / 100 with one decimal, and the index itself in the help", () => {
    expect(ageingRatio(417.9)).toBe("4.2");
    expect(tc.ageingLabel).toBe("older people (65+) per child");
    expect(ageingHelpText(417.9, 188.8)).toBe("Ageing index 418 (Portugal: 189): people aged 65 and over per 100 children under 15. Source: INE.");
  });

  it("reads naturally below 1 (fewer older people than children) and at exactly 1", () => {
    expect(ageingRatio(80)).toBe("0.8");
    expect(ageingRatio(100)).toBe("1.0");
  });

  it("covers the real range in the data", () => {
    // 2025: Montijo 1.1 (111.3) to Vinhais 6.9 (687.0), none below 1. A sanity range, so a refresh can move it.
    const ratios = Object.values(data.concelhos).map((c) => c.ageing_index! / 100);
    expect(Math.min(...ratios)).toBeGreaterThan(0.5);
    expect(Math.max(...ratios)).toBeLessThan(10);
    expect(ageingRatio(data.national.ageing_index)).toBe("1.9");
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
    expect(body).toContain("PDM status: in_force");
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
