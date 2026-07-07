import { describe, it, expect, vi } from "vitest";
import { githubReleases } from "../src/sources/githubReleases.js";
import { githubCode } from "../src/sources/githubCode.js";
import type { SearchContext } from "../src/types.js";

const keys = [{ term: "settle", weight: 5, kind: "function" as const }];

describe("githubReleases", () => {
  it("keeps only releases whose name/body mentions a key term", async () => {
    const listReleases = vi.fn().mockResolvedValue({
      data: [
        { name: "v1.1.0", tag_name: "v1.1.0", html_url: "http://r/1", body: "fix settle rounding" },
        { name: "v1.0.0", tag_name: "v1.0.0", html_url: "http://r/0", body: "initial release" },
      ],
    });
    const ctx = {
      client: { owner: "acme", repo: "vault", octokit: { rest: { repos: { listReleases } } } },
      finding: { title: "settle", description: "" },
      keys,
      log: () => {},
    } as unknown as SearchContext;
    const res = await githubReleases.search(ctx);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].id).toBe("v1.1.0");
  });
});

describe("githubCode", () => {
  it("maps code results to matches with filePath", async () => {
    const code = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            path: "src/Vault.sol",
            html_url: "http://code/1",
            repository: { full_name: "acme/vault" },
          },
        ],
      },
    });
    const ctx = {
      client: { owner: "acme", repo: "vault", octokit: { rest: { search: { code } } } },
      finding: { title: "settle", description: "" },
      keys,
      log: () => {},
    } as unknown as SearchContext;
    const res = await githubCode.search(ctx);
    expect(res.matches[0].filePath).toBe("src/Vault.sol");
  });
});
