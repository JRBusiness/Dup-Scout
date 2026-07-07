import type { KeyKind, SearchContext, WeightedKey } from "../types.js";

// Higher = rarer / more distinctive → better search precision. Identifiers,
// custom errors, and selectors uniquely pin a bug; common invariant/pattern
// words (e.g. "notification", "signature") match hundreds of unrelated items,
// so they go last and get dropped first when the term list is capped.
const KIND_PRIORITY: Record<KeyKind, number> = {
  error: 6,
  selector: 6,
  function: 5,
  event: 5,
  modifier: 5,
  contract: 4,
  file: 4,
  invariant: 3,
  pattern: 2,
  generic: 0,
};

export function keyTerms(keys: WeightedKey[], max = 8): string {
  return [...keys]
    .filter((k) => k.kind !== "generic")
    .sort(
      (a, b) =>
        KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] ||
        b.weight - a.weight ||
        b.term.length - a.term.length,
    )
    .slice(0, max)
    .map((k) => (k.term.includes(" ") ? `"${k.term}"` : k.term))
    .join(" OR ");
}

export function buildQuery(ctx: SearchContext, typeQualifier: string): string {
  const repo = `repo:${ctx.client.owner}/${ctx.client.repo}`;
  const terms = keyTerms(ctx.keys);
  return `${repo} ${typeQualifier} ${terms}`.trim();
}
