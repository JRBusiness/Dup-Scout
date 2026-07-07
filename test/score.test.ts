import { describe, it, expect } from "vitest";
import { scoreMatch, aggregate, THRESHOLDS } from "../src/score.js";
import type { RawMatch, WeightedKey, Finding } from "../src/types.js";

const finding: Finding = {
  title: "Reentrancy in claim",
  description: "",
  functions: ["claim"],
  file: "src/Vault.sol",
};
const keys: WeightedKey[] = [
  { term: "claim", weight: 5, kind: "function" },
  { term: "Vault", weight: 4, kind: "contract" },
  { term: "reentrancy", weight: 3, kind: "pattern" },
];

describe("scoreMatch", () => {
  it("scores an exact-function merged PR highly", () => {
    const raw: RawMatch = {
      sourceId: "github-prs",
      id: "#12",
      url: "u",
      title: "Fix reentrancy in claim()",
      state: "merged",
      signals: ["security-title"],
    };
    const m = scoreMatch(raw, keys, finding);
    expect(m.matchedKeys).toContain("claim");
    expect(m.score).toBeGreaterThanOrEqual(THRESHOLDS.duplicate);
  });
  it("scores an unrelated issue low", () => {
    const raw: RawMatch = {
      sourceId: "github-issues",
      id: "#3",
      url: "u",
      title: "typo in README",
    };
    expect(scoreMatch(raw, keys, finding).score).toBeLessThan(THRESHOLDS.partial);
  });
});

describe("aggregate", () => {
  const mk = (over: Partial<RawMatch>): RawMatch => ({
    sourceId: "github-prs",
    id: "#1",
    url: "u",
    title: "Fix reentrancy in claim()",
    state: "merged",
    signals: ["security-title"],
    ...over,
  });
  it("returns NOVEL when there are no matches", () => {
    expect(aggregate([], finding).label).toBe("NOVEL");
  });
  it("returns DUPLICATE on a high-score same-function match", () => {
    const m = scoreMatch(mk({}), keys, finding);
    expect(aggregate([m], finding).label).toBe("DUPLICATE");
  });
  it("returns KNOWN-ISSUE when top match carries audit-ack", () => {
    const m = scoreMatch(mk({ sourceId: "audit-reports", signals: ["audit-ack"] }), keys, finding);
    expect(aggregate([m], finding).label).toBe("KNOWN-ISSUE");
  });
  it("returns SILENTLY-FIXED when top match carries silent-fix", () => {
    const m = scoreMatch(
      mk({ sourceId: "github-commits", signals: ["silent-fix"], filePath: "src/Vault.sol" }),
      keys,
      finding,
    );
    expect(aggregate([m], finding).label).toBe("SILENTLY-FIXED");
  });
});
