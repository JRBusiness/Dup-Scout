import { describe, it, expect, vi } from "vitest";
import { githubCommits } from "../src/sources/githubCommits.js";
import { makeBudget } from "../src/github/retrieval.js";
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
    budget: makeBudget(40),
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

describe("githubCommits per-term retrieval", () => {
  it("merges commit results across per-term queries, deduped", async () => {
    const byQuery: Record<string, unknown[]> = {
      "repo:acme/vault ROUND_DOWN OR settle": [
        { sha: "aaaaaaa1", html_url: "c1", commit: { message: "chore" } },
      ],
      "repo:acme/vault ROUND_DOWN": [
        { sha: "bbbbbbb2", html_url: "c2", commit: { message: "fix ROUND_DOWN in settle" } },
      ],
      "repo:acme/vault settle": [{ sha: "aaaaaaa1", html_url: "c1", commit: { message: "chore" } }],
    };
    const commits = vi.fn(async ({ q }: { q: string }) => ({
      data: { items: byQuery[q] ?? [], total_count: (byQuery[q] ?? []).length },
    }));
    const ctx = {
      client: { owner: "acme", repo: "vault", octokit: { rest: { search: { commits } } } },
      finding: { title: "settle rounds via ROUND_DOWN", description: "", functions: ["settle"] },
      keys: [
        { term: "settle", weight: 5, kind: "function" },
        { term: "ROUND_DOWN", weight: 6, kind: "selector" },
      ],
      budget: makeBudget(40),
      log: () => {},
    } as unknown as SearchContext;
    const res = await githubCommits.search(ctx);
    const ids = res.matches.map((m) => m.id);
    expect(ids).toContain("bbbbbbb");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
