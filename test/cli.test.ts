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

  it("exits non-zero for an invalid --fail-on label and does not silently pass", async () => {
    const write = vi.fn();
    const writeErr = vi.fn();
    const exit = vi.fn();
    const run = vi.fn().mockResolvedValue(verdict);
    await runCli(["node", "dup-scout", "acme/vault", "--title", "t", "--fail-on", "DUPLICAT"], {
      run,
      write,
      writeErr,
      exit,
    });
    expect(exit).toHaveBeenCalledWith(2);
    expect(run).not.toHaveBeenCalled();
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining("invalid --fail-on"));
  });

  it("exits non-zero for a non-numeric --min-score", async () => {
    const write = vi.fn();
    const writeErr = vi.fn();
    const exit = vi.fn();
    const run = vi.fn().mockResolvedValue(verdict);
    await runCli(["node", "dup-scout", "acme/vault", "--title", "t", "--min-score", "high"], {
      run,
      write,
      writeErr,
      exit,
    });
    expect(exit).toHaveBeenCalledWith(2);
    expect(run).not.toHaveBeenCalled();
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining("invalid --min-score"));
  });

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

describe("runCli install", () => {
  it("writes command files for both agents and reports status", async () => {
    const write = vi.fn();
    const written: Record<string, string> = {};
    const installFs = {
      exists: () => false,
      mkdir: () => {},
      write: (p: string, d: string) => {
        written[p] = d;
      },
    };
    await runCli(["node", "dup-scout", "install", "--all"], { write, installFs });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("dup-scout.md"));
    expect(Object.keys(written).length).toBe(2);
  });
});
