import { describe, it, expect, vi } from "vitest";
import { makeBudget, searchPaged, mergeById, runSearches } from "../src/github/retrieval.js";

function page(items: number[], total: number) {
  return { data: { items: items.map((n) => ({ n })), total_count: total } };
}

describe("makeBudget", () => {
  it("defaults to 40", () => {
    expect(makeBudget().remaining).toBe(40);
    expect(makeBudget(5).remaining).toBe(5);
  });
});

describe("searchPaged", () => {
  it("stops at maxPages, decrements budget, and flags truncation", async () => {
    const budget = makeBudget(10);
    const fullPage = (p: number) => ({
      data: {
        items: Array.from({ length: 100 }, (_, i) => ({ n: p * 1000 + i })),
        total_count: 250,
      },
    });
    const call = vi.fn(async (p: number) => fullPage(p));
    const r = await searchPaged(call, { maxPages: 2, budget });
    expect(call).toHaveBeenCalledTimes(2);
    expect(budget.remaining).toBe(8);
    expect(r.truncated).toBe(true); // total 250 > fetched 200
    expect(r.items).toHaveLength(200);
  });

  it("stops early on a short page and is not truncated when total is covered", async () => {
    const budget = makeBudget(10);
    const call = vi.fn(async () => ({ data: { items: [{ n: 1 }, { n: 2 }], total_count: 2 } }));
    const r = await searchPaged(call, { maxPages: 5, budget });
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.truncated).toBe(false);
  });

  it("stops when the budget is exhausted and flags truncation", async () => {
    const budget = makeBudget(1);
    const call = vi.fn(async (p: number) => page([p], 999));
    const r = await searchPaged(call, { maxPages: 5, budget });
    expect(call).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
    expect(r.truncated).toBe(true);
  });
});

describe("mergeById", () => {
  it("dedups across groups keeping first occurrence", () => {
    const merged = mergeById(
      [
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "c" }],
      ],
      (x) => x.id,
    );
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("runSearches", () => {
  it("runs each query and merges deduped results", async () => {
    const budget = makeBudget(40);
    const responses: Record<string, { n: number }[]> = {
      q1: [{ n: 1 }, { n: 2 }],
      q2: [{ n: 2 }, { n: 3 }],
    };
    const call = vi.fn(async (q: string) => ({
      data: { items: responses[q], total_count: responses[q].length },
    }));
    const r = await runSearches(["q1", "q2"], call, (x) => String(x.n), { budget });
    expect(r.items.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
