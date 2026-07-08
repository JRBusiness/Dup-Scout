import type { KeyKind, SearchContext, WeightedKey } from "../types.js";

// Higher = rarer or more distinctive, which improves search precision. Identifiers,
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

// The most distinctive terms, one per query. Same distinctive-first ordering
// and generic-drop/multiword-quoting as keyTerms, but returned as a list (not
// OR-joined) so each can scope its own precise search.
export function highSignalTerms(keys: WeightedKey[], max = 6): string[] {
  return [...keys]
    .filter((k) => k.kind !== "generic")
    .sort(
      (a, b) =>
        KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] ||
        b.weight - a.weight ||
        b.term.length - a.term.length,
    )
    .slice(0, max)
    .map((k) => (k.term.includes(" ") ? `"${k.term}"` : k.term));
}

// GitHub's search API rejects a query with "More than five AND / OR / NOT
// operators" (HTTP 422). N OR-joined terms use N-1 operators, so the broad
// union query is capped at 6 terms (5 operators) to stay valid. Exceeding it
// makes the broad query 422. Because it runs first, that error would otherwise
// abort the whole source before the scoped per-term queries run.
export const MAX_BROAD_TERMS = 6;

// One broad OR union query plus one scoped query per high-signal term, all
// scoped to `repo:owner/name [typeQualifier]`, deduped, and stripped of any
// query that degenerated to the bare base (no usable terms).
export function queriesFor(ctx: SearchContext, typeQualifier: string): string[] {
  const base = `repo:${ctx.client.owner}/${ctx.client.repo}${typeQualifier ? ` ${typeQualifier}` : ""}`;
  const broadTerms = keyTerms(ctx.keys, MAX_BROAD_TERMS);
  const queries: string[] = [];
  if (broadTerms) queries.push(`${base} ${broadTerms}`.trim());
  for (const term of highSignalTerms(ctx.keys)) {
    queries.push(`${base} ${term}`.trim());
  }
  return Array.from(new Set(queries)).filter((q) => q !== base);
}
