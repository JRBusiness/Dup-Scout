import type { VerdictLabel } from "./types.js";

export const VERDICT_RANK: Record<VerdictLabel, number> = {
  NOVEL: 0,
  "PARTIAL-OVERLAP": 1,
  "SILENTLY-FIXED": 2,
  "KNOWN-ISSUE": 3,
  DUPLICATE: 4,
};

export function verdictRank(label: VerdictLabel): number {
  return VERDICT_RANK[label];
}
