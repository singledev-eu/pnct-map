/**
 * The map's PNCT definition is the legal one: the annex of Portaria 208/2017 (as amended; no
 * amendment found). Where the legal text and the IEFP list disagree, a parish is "disputed": it is
 * never shown or counted as PNCT, it gets its own map style, and its panel and tooltip say which
 * source says what (data/sources/pnct-legal-status.md, data/pnct_status.csv → pnct-status.json).
 */
import STATUS from "../data/pnct-status.json";

export type LegalStatus = "pnct" | "not_pnct";

export interface Dispute {
  legal: LegalStatus;
  iefp: LegalStatus;
  sources: { url: string; en: string; pt: string }[];
}

const disputes = STATUS.disputed as Record<string, Dispute>;

export const DISPUTED: ReadonlySet<string> = new Set(Object.keys(disputes));
export const STATUS_CHECKED: string = STATUS.checked;
export const LEGAL_SOURCE: { url: string; en: string; pt: string } = STATUS.legal;

export function disputeOf(dicofre: string): Dispute | undefined {
  return disputes[dicofre];
}
