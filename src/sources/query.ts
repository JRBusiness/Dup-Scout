import type { SearchContext, WeightedKey } from "../types.js";

export function keyTerms(keys: WeightedKey[], max = 6): string {
  return keys
    .filter((k) => k.kind !== "generic")
    .slice(0, max)
    .map((k) => (k.term.includes(" ") ? `"${k.term}"` : k.term))
    .join(" OR ");
}

export function buildQuery(ctx: SearchContext, typeQualifier: string): string {
  const repo = `repo:${ctx.client.owner}/${ctx.client.repo}`;
  const terms = keyTerms(ctx.keys);
  return `${repo} ${typeQualifier} ${terms}`.trim();
}
