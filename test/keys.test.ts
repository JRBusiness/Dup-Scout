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
