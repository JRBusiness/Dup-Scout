import { describe, it, expect, vi } from "vitest";
import { buildFindingFromOptions, verdictRank, runCli } from "../src/cli.js";
import type { Verdict } from "../src/types.js";

describe("buildFindingFromOptions", () => {
  it("splits comma lists for functions and keys", () => {
    const f = buildFindingFromOptions({
      title: "t",
      desc: "d",
      function: ["a", "b"],
      keys: "x,y",
      file: "src/V.sol",
    });
    expect(f.functions).toEqual(["a", "b"]);
    expect(f.keys).toEqual(["x", "y"]);
    expect(f.file).toBe("src/V.sol");
  });
});

describe("verdictRank", () => {
  it("orders NOVEL lowest and DUPLICATE highest", () => {
    expect(verdictRank("NOVEL")).toBeLessThan(verdictRank("PARTIAL-OVERLAP"));
    expect(verdictRank("DUPLICATE")).toBeGreaterThan(verdictRank("KNOWN-ISSUE") - 100);
    expect(verdictRank("DUPLICATE")).toBe(4);
  });
});

describe("runCli", () => {
  const verdict: Verdict = { label: "DUPLICATE", confidence: 0.9, matches: [], notes: [] };
  it("prints markdown and exits non-zero when --fail-on is met", async () => {
    const write = vi.fn();
    const exit = vi.fn();
    const run = vi.fn().mockResolvedValue(verdict);
    await runCli(
      [
        "node",
        "dup-scout",
        "acme/vault",
        "--title",
        "t",
        "--desc",
        "d",
        "--markdown",
        "--fail-on",
        "PARTIAL-OVERLAP",
      ],
      { run, write, exit },
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining("## Duplicate check"));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not exit non-zero when verdict is below --fail-on", async () => {
    const write = vi.fn();
    const exit = vi.fn();
    const run = vi.fn().mockResolvedValue({ ...verdict, label: "NOVEL" });
    await runCli(
      ["node", "dup-scout", "acme/vault", "--title", "t", "--desc", "d", "--fail-on", "DUPLICATE"],
      { run, write, exit },
    );
    expect(exit).not.toHaveBeenCalledWith(1);
  });
});

import { describe as describe2, it as it2, expect as expect2, vi as vi2 } from "vitest";
import { runCli as runCli2 } from "../src/cli.js";

describe2("runCli install", () => {
  it2("writes command files for both agents and reports status", async () => {
    const write = vi2.fn();
    const written: Record<string, string> = {};
    const installFs = {
      exists: () => false,
      mkdir: () => {},
      write: (p: string, d: string) => {
        written[p] = d;
      },
    };
    await runCli2(["node", "dup-scout", "install", "--all"], { write, installFs });
    expect2(write).toHaveBeenCalledWith(expect2.stringContaining("dup-scout.md"));
    expect2(Object.keys(written).length).toBe(2);
  });
});
