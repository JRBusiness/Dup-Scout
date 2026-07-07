import { describe, it, expect, vi } from "vitest";
import { githubCommits } from "../src/sources/githubCommits.js";
import type { SearchContext } from "../src/types.js";

function ctx(opts: {
  commitItems?: unknown[];
  compareFiles?: unknown[];
  scopeTag?: string;
  file?: string;
}): SearchContext {
  const commits = vi.fn().mockResolvedValue({ data: { items: opts.commitItems ?? [] } });
  const compareCommitsWithBasehead = vi
    .fn()
    .mockResolvedValue({ data: { files: opts.compareFiles ?? [] } });
  return {
    client: {
      owner: "acme",
      repo: "vault",
      octokit: { rest: { search: { commits }, repos: { compareCommitsWithBasehead } } },
    },
    finding: {
      title: "Rounding in settle",
      description: "",
      functions: ["settle"],
      file: opts.file,
      scopeTag: opts.scopeTag,
    },
    keys: [{ term: "settle", weight: 5, kind: "function" }],
    log: () => {},
  } as unknown as SearchContext;
}

describe("githubCommits", () => {
  it("maps commit search results", async () => {
    const c = ctx({
      commitItems: [
        { sha: "abc1234", html_url: "http://c/abc", commit: { message: "fix settle rounding" } },
      ],
    });
    const res = await githubCommits.search(c);
    expect(res.matches[0].id).toBe("abc1234");
    expect(res.matches[0].title).toContain("settle");
  });

  it("emits a silent-fix match when scopeTag..HEAD touches the affected file", async () => {
    const c = ctx({
      scopeTag: "v1.0.0",
      file: "src/Vault.sol",
      compareFiles: [{ filename: "src/Vault.sol", status: "modified", patch: "- old\n+ new" }],
    });
    const res = await githubCommits.search(c);
    const silent = res.matches.find((m) => m.signals?.includes("silent-fix"));
    expect(silent).toBeDefined();
    expect(silent?.filePath).toBe("src/Vault.sol");
  });

  it("skips silent-fix detection when scopeTag or file is absent", async () => {
    const c = ctx({ commitItems: [] });
    const res = await githubCommits.search(c);
    expect(res.matches.some((m) => m.signals?.includes("silent-fix"))).toBe(false);
  });
});
