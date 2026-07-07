import { describe, it, expect } from "vitest";
import { recallAtK, verdictMeets, verdictAtMost } from "../benchmark/metrics.js";

describe("recallAtK", () => {
  const matches = [{ id: "#1" }, { id: "#2" }, { id: "#3" }, { id: "#4" }];
  it("is 1 when all known ids are within top k", () => {
    expect(recallAtK(matches, ["#2", "#3"], 3)).toBe(1);
  });
  it("is fractional when some known ids fall outside top k", () => {
    expect(recallAtK(matches, ["#2", "#4"], 2)).toBe(0.5);
  });
  it("is 1 (vacuous) when there are no known ids", () => {
    expect(recallAtK(matches, [], 3)).toBe(1);
  });
});

describe("verdictMeets", () => {
  it("passes when actual meets or exceeds the minimum", () => {
    expect(verdictMeets("DUPLICATE", "PARTIAL-OVERLAP")).toBe(true);
    expect(verdictMeets("NOVEL", "NOVEL")).toBe(true);
    expect(verdictMeets("PARTIAL-OVERLAP", "DUPLICATE")).toBe(false);
  });
});

describe("verdictAtMost", () => {
  it("passes when actual is at or below the maximum", () => {
    expect(verdictAtMost("NOVEL", "NOVEL")).toBe(true);
    expect(verdictAtMost("DUPLICATE", "NOVEL")).toBe(false);
    expect(verdictAtMost("PARTIAL-OVERLAP", "KNOWN-ISSUE")).toBe(true);
  });
});
