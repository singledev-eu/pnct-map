import type { Parish } from "./data";

export interface PropertyLink {
  label: string;
  url: string;
  description?: string;
}

/** Property-search links for a parish. Phase 3 fills this in. */
export function getLinks(_parish: Parish): PropertyLink[] {
  return [];
}
