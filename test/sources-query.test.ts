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
  const s = (id: string, on: boolean): Source => ({ id, enabledByDefault: on, search: async () => ({ matches: [] }) });
  it("selects defaults when no ids given, explicit ids otherwise", () => {
    const r = new SourceRegistry();
    r.register(s("a", true));
    r.register(s("b", false));
    expect(r.select().map((x) => x.id)).toEqual(["a"]);
    expect(r.select(["b"]).map((x) => x.id)).toEqual(["b"]);
  });
});
