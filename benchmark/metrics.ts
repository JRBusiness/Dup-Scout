import { verdictRank } from "../src/verdict.js";
import type { VerdictLabel } from "../src/types.js";

export function recallAtK(matches: { id: string }[], knownIds: string[], k: number): number {
  if (knownIds.length === 0) return 1;
  const topIds = new Set(matches.slice(0, k).map((m) => m.id));
  const found = knownIds.filter((id) => topIds.has(id)).length;
  return found / knownIds.length;
}

export function verdictMeets(actual: VerdictLabel, min: VerdictLabel): boolean {
  return verdictRank(actual) >= verdictRank(min);
}

export function verdictAtMost(actual: VerdictLabel, max: VerdictLabel): boolean {
  return verdictRank(actual) <= verdictRank(max);
}
