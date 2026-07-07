import { describe, it, expect, vi } from "vitest";
import { githubPrs } from "../src/sources/githubPrs.js";
import { githubIssues } from "../src/sources/githubIssues.js";
import type { SearchContext } from "../src/types.js";

function ctxWith(items: unknown[]): SearchContext {
  const issuesAndPullRequests = vi.fn().mockResolvedValue({ data: { items } });
  return {
    client: { owner: "acme", repo: "vault", octokit: { rest: { search: { issuesAndPullRequests } } } },
    finding: { title: "Reentrancy in claim", description: "", functions: ["claim"] },
    keys: [{ term: "claim", weight: 5, kind: "function" }],
    log: () => {},
  } as unknown as SearchContext;
}

describe("githubPrs", () => {
  it("maps merged PRs and flags security titles", async () => {
    const ctx = ctxWith([
      { number: 12, html_url: "http://pr/12", title: "Fix reentrancy in claim()", state: "closed", pull_request: { merged_at: "2024-01-01" }, body: "patched" },
    ]);
    const res = await githubPrs.search(ctx);
    expect(res.matches[0].id).toBe("#12");
    expect(res.matches[0].state).toBe("merged");
    expect(res.matches[0].signals).toContain("security-title");
  });

  it("honours dryRun without calling the API", async () => {
    const ctx = ctxWith([]);
    (ctx as unknown as { dryRun: boolean }).dryRun = true;
    const res = await githubPrs.search(ctx);
    expect(res.matches).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.client.octokit as any).rest.search.issuesAndPullRequests).not.toHaveBeenCalled();
  });
});

describe("githubIssues", () => {
  it("maps issue state directly", async () => {
    const ctx = ctxWith([{ number: 3, html_url: "http://i/3", title: "claim double-spend", state: "closed", body: "" }]);
    const res = await githubIssues.search(ctx);
    expect(res.matches[0].state).toBe("closed");
    expect(res.matches[0].sourceId).toBe("github-issues");
  });
});
