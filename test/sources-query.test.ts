import { describe, it, expect } from "vitest";
import { keyTerms, buildQuery } from "../src/sources/query.js";
import { securitySignals } from "../src/sources/signals.js";
import { SourceRegistry } from "../src/sources/index.js";
import type { SearchContext, WeightedKey, Source } from "../src/types.js";

const keys: WeightedKey[] = [
  { term: "claim", weight: 5, kind: "function" },
  { term: "share price", weight: 4, kind: "invariant" },
  { term: "the", weight: 1, kind: "generic" },
];

describe("keyTerms", () => {
  it("drops generic kinds, quotes multiword terms, joins with OR", () => {
    const q = keyTerms(keys);
    expect(q).toContain("claim");
    expect(q).toContain('"share price"');
    expect(q).not.toContain("the");
    expect(q).toContain(" OR ");
  });

  it("orders distinctive kinds (error/function) before common invariant/pattern words", () => {
    // Deliberately supply the common invariant first; the result should still
    // lead with the distinctive identifier/error so the search stays precise.
    const mixed: WeightedKey[] = [
      { term: "notification", weight: 4, kind: "invariant" },
      { term: "reentrancy", weight: 3, kind: "pattern" },
      { term: "InsufficientBalance", weight: 4, kind: "error" },
      { term: "claimReward", weight: 5, kind: "function" },
    ];
    const q = keyTerms(mixed);
    const order = ["InsufficientBalance", "claimReward", "notification", "reentrancy"].map((t) =>
      q.indexOf(t),
    );
    // error first, then function, then invariant, then pattern.
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(order[2]).toBeLessThan(order[3]);
  });

  it("caps the term list (default max 8)", () => {
    const many: WeightedKey[] = Array.from({ length: 12 }, (_, i) => ({
      term: `fn${i}`,
      weight: 5,
      kind: "function" as const,
    }));
    expect(keyTerms(many).split(" OR ")).toHaveLength(8);
  });
});

describe("buildQuery", () => {
  it("prefixes repo and type qualifier", () => {
    const ctx = { client: { owner: "acme", repo: "vault" }, keys } as unknown as SearchContext;
    expect(buildQuery(ctx, "type:pr")).toMatch(/^repo:acme\/vault type:pr /);
  });
});

describe("securitySignals", () => {
  it("flags security wording", () => {
    expect(securitySignals("Fix reentrancy vuln")).toContain("security-title");
    expect(securitySignals("update docs")).toEqual([]);
  });
});

describe("SourceRegistry", () => {
  const s = (id: string, on: boolean): Source => ({
    id,
    enabledByDefault: on,
    search: async () => ({ matches: [] }),
  });
  it("selects defaults when no ids given, explicit ids otherwise", () => {
    const r = new SourceRegistry();
    r.register(s("a", true));
    r.register(s("b", false));
    expect(r.select().map((x) => x.id)).toEqual(["a"]);
    expect(r.select(["b"]).map((x) => x.id)).toEqual(["b"]);
  });
});
