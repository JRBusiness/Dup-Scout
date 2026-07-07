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

  it("does not let many generic words dilute a strong signal-key match", () => {
    // A realistic finding: a few distinctive signal keys plus lots of common
    // filler words (generic). A match that hits ALL the signal keys should
    // score highly even though it matches none of the generic filler.
    const dilutedKeys: WeightedKey[] = [
      { term: "notification", weight: 4, kind: "invariant" },
      { term: "lifecycle", weight: 4, kind: "invariant" },
      { term: "overriding", weight: 4, kind: "invariant" },
      ...Array.from({ length: 12 }, (_, i): WeightedKey => ({
        term: `word${i}`,
        weight: 1,
        kind: "generic",
      })),
    ];
    const raw: RawMatch = {
      sourceId: "github-issues",
      id: "#2264",
      url: "u",
      title: "Fix transaction lifecycle notifications overriding new status",
      state: "open",
      signals: ["security-title"],
    };
    const m = scoreMatch(raw, dilutedKeys, { title: "x", description: "" });
    // All three signal keys hit (notification⊂notifications, lifecycle, overriding),
    // so the signal-driven base is ~90 before boosts — comfortably PARTIAL-OVERLAP.
    expect(m.matchedKeys).toEqual(
      expect.arrayContaining(["notification", "lifecycle", "overriding"]),
    );
    expect(m.score).toBeGreaterThanOrEqual(THRESHOLDS.partial);
  });

  it("scores a generic-only match low", () => {
    const dilutedKeys: WeightedKey[] = [
      { term: "notification", weight: 4, kind: "invariant" },
      { term: "lifecycle", weight: 4, kind: "invariant" },
      { term: "signaturebug", weight: 4, kind: "invariant" },
      { term: "transaction", weight: 1, kind: "generic" },
    ];
    // Only the generic "transaction" appears; no signal key matches.
    const raw: RawMatch = {
      sourceId: "github-prs",
      id: "#9",
      url: "u",
      title: "chore: bump transaction dependency",
    };
    expect(scoreMatch(raw, dilutedKeys, { title: "x", description: "" }).score).toBeLessThan(
      THRESHOLDS.partial,
    );
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
