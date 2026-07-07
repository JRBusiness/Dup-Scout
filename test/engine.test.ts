import { describe, it, expect } from "vitest";
import { run } from "../src/engine.js";
import { SourceRegistry } from "../src/sources/index.js";
import type { Source } from "../src/types.js";

const fakePrSource: Source = {
  id: "github-prs",
  enabledByDefault: true,
  async search() {
    return {
      matches: [
        {
          sourceId: "github-prs",
          id: "#12",
          url: "http://pr/12",
          title: "Fix reentrancy in claim()",
          filePath: "src/Vault.sol",
          state: "merged",
          signals: ["security-title"],
        },
      ],
    };
  },
};

const noteSource: Source = {
  id: "contests",
  enabledByDefault: true,
  async search() {
    return { matches: [], notes: ["Manual check: http://c4"] };
  },
};

describe("run", () => {
  it("scores matches, aggregates a verdict, and collects notes", async () => {
    const registry = new SourceRegistry();
    registry.register(fakePrSource);
    registry.register(noteSource);
    const verdict = await run({
      repo: "acme/vault",
      finding: {
        title: "Reentrancy in claim",
        description: "",
        functions: ["claim"],
        file: "src/Vault.sol",
      },
      token: "x",
      registry,
    });
    expect(verdict.label).toBe("DUPLICATE");
    expect(verdict.matches[0].id).toBe("#12");
    expect(verdict.notes).toContain("Manual check: http://c4");
  });

  it("does not crash if a source throws (isolated failure)", async () => {
    const bad: Source = {
      id: "github-issues",
      enabledByDefault: true,
      async search() {
        throw new Error("boom");
      },
    };
    const registry = new SourceRegistry();
    registry.register(bad);
    const verdict = await run({
      repo: "acme/vault",
      finding: { title: "x", description: "" },
      token: "x",
      registry,
    });
    expect(verdict.label).toBe("NOVEL");
    expect(verdict.notes.some((n) => n.includes("github-issues"))).toBe(true);
  });
});

describe("run clientFactory injection", () => {
  it("uses an injected clientFactory instead of the real GitHub client", async () => {
    const { run } = await import("../src/engine.js");
    const { SourceRegistry } = await import("../src/sources/index.js");
    let sawClient = false;
    const fakeClient = { owner: "acme", repo: "vault", octokit: {} } as never;
    const registry = new SourceRegistry();
    registry.register({
      id: "probe",
      enabledByDefault: true,
      async search(ctx) {
        sawClient = ctx.client === fakeClient && ctx.budget !== undefined;
        return { matches: [] };
      },
    });
    await run({
      repo: "acme/vault",
      finding: { title: "x", description: "" },
      registry,
      clientFactory: () => fakeClient,
    });
    expect(sawClient).toBe(true);
  });
});
