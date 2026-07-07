import { describe, it, expect } from "vitest";
import { extractKeys } from "../src/keys.js";

describe("extractKeys", () => {
  it("weights explicit function and file keys highest and dedupes", () => {
    const keys = extractKeys({
      title: "Reentrancy in claim lets attacker drain",
      description: "the claim() function reenters via _settle",
      functions: ["claim"],
      file: "src/Vault.sol",
      bugClass: "reentrancy",
    });
    const claim = keys.find((k) => k.term === "claim");
    expect(claim?.kind).toBe("function");
    expect(claim?.weight).toBeGreaterThanOrEqual(5);
    expect(keys.some((k) => k.term === "Vault" && k.kind === "contract")).toBe(true);
    expect(keys.some((k) => k.term === "reentrancy" && k.kind === "pattern")).toBe(true);
    // dedupe: "claim" appears once even though it is in title, desc, and functions
    expect(keys.filter((k) => k.term.toLowerCase() === "claim").length).toBe(1);
  });

  it("drops stopwords and marks camelCase/underscore identifiers as function kind", () => {
    const keys = extractKeys({ title: "The value of _settle", description: "when getReward runs" });
    expect(keys.some((k) => k.term.toLowerCase() === "when")).toBe(false);
    expect(keys.some((k) => k.term === "_settle" && k.kind === "function")).toBe(true);
    expect(keys.some((k) => k.term === "getReward" && k.kind === "function")).toBe(true);
  });
});

describe("extractKeys high-signal tokens", () => {
  it("classifies enums, selectors, errors, and identifiers with high weight", () => {
    const keys = extractKeys({
      title: "Missed WAITING_FOR_SIGNATURES via clearNewIndicatorForUser",
      description: "throws InsufficientBalance; selector 0xa9059cbb",
    });
    const byTerm = (t: string) => keys.find((k) => k.term === t);
    expect(byTerm("WAITING_FOR_SIGNATURES")).toMatchObject({ kind: "selector", weight: 6 });
    expect(byTerm("0xa9059cbb")).toMatchObject({ kind: "selector", weight: 6 });
    expect(byTerm("InsufficientBalance")).toMatchObject({ kind: "error", weight: 6 });
    expect(byTerm("clearNewIndicatorForUser")).toMatchObject({ kind: "function", weight: 5 });
  });

  it("keeps single all-caps or single-hump words generic", () => {
    const keys = extractKeys({ title: "The WAITING transaction failed", description: "" });
    expect(keys.find((k) => k.term.toLowerCase() === "waiting")?.kind ?? "generic").toBe("generic");
    expect(keys.find((k) => k.term.toLowerCase() === "transaction")?.kind ?? "generic").toBe(
      "generic",
    );
  });
});
