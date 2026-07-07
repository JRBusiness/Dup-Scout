import { describe, it, expect } from "vitest";
import { verdictRank, VERDICT_RANK } from "../src/verdict.js";

describe("verdictRank", () => {
  it("orders NOVEL lowest and DUPLICATE highest", () => {
    expect(verdictRank("NOVEL")).toBe(0);
    expect(verdictRank("DUPLICATE")).toBe(4);
    expect(VERDICT_RANK["PARTIAL-OVERLAP"]).toBeLessThan(VERDICT_RANK["KNOWN-ISSUE"]);
  });
});
