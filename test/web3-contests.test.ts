import { describe, it, expect, vi } from "vitest";
import { contestUrls, contests } from "../src/sources/web3/contests.js";
import type { SearchContext } from "../src/types.js";

describe("contestUrls", () => {
  it("builds search URLs for the major platforms", () => {
    const urls = contestUrls("vault", ["settle"]);
    expect(urls.some((u) => u.includes("code4rena"))).toBe(true);
    expect(urls.some((u) => u.includes("sherlock"))).toBe(true);
    expect(urls.some((u) => u.includes("settle"))).toBe(true);
  });
});

const base = {
  client: { owner: "acme", repo: "vault" },
  finding: { title: "settle rounding", description: "" },
  keys: [{ term: "settle", weight: 5, kind: "function" as const }],
  log: () => {},
};

describe("contests source", () => {
  it("returns candidate URLs as notes in guided mode (no fetch)", async () => {
    const res = await contests.search(base as unknown as SearchContext);
    expect(res.matches).toEqual([]);
    expect(res.notes && res.notes.length).toBeGreaterThan(0);
  });

  it("emits a contest match when fetch reveals a key term", async () => {
    const fetch = vi.fn().mockResolvedValue("... the settle function rounds down ...");
    const ctx = { ...base, fetch } as unknown as SearchContext;
    const res = await contests.search(ctx);
    expect(res.matches.some((m) => m.signals?.includes("contest"))).toBe(true);
  });
});
