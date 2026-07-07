import { describe, it, expect } from "vitest";
import { parseFindingFromObject, parseFindingMarkdown } from "../src/finding.js";

describe("parseFindingFromObject", () => {
  it("maps fields and defaults description", () => {
    const f = parseFindingFromObject({ title: "Reentrancy in claim", functions: ["claim"] });
    expect(f.title).toBe("Reentrancy in claim");
    expect(f.description).toBe("");
    expect(f.functions).toEqual(["claim"]);
  });
  it("throws without a title", () => {
    expect(() => parseFindingFromObject({})).toThrow(/title/);
  });
});

describe("parseFindingMarkdown", () => {
  it("extracts title, body, and fields", () => {
    const md = [
      "# Rounding error in _settle",
      "",
      "The _settle() path rounds down and lets an attacker drain dust.",
      "File: src/Vault.sol",
      "Functions: _settle, claim",
      "Scope-Tag: v1.2.0",
    ].join("\n");
    const f = parseFindingMarkdown(md);
    expect(f.title).toBe("Rounding error in _settle");
    expect(f.file).toBe("src/Vault.sol");
    expect(f.functions).toEqual(["_settle", "claim"]);
    expect(f.scopeTag).toBe("v1.2.0");
    expect(f.description).toContain("rounds down");
  });
});
