import { describe, it, expect } from "vitest";
import { callKey, replayFactory, type Fixture } from "../benchmark/replayClient.js";

describe("callKey", () => {
  it("is stable regardless of param key order", () => {
    expect(callKey("search.issuesAndPullRequests", { q: "x", page: 1 })).toBe(
      callKey("search.issuesAndPullRequests", { page: 1, q: "x" }),
    );
  });
});

describe("replayFactory", () => {
  it("returns recorded data and throws recorded errors", async () => {
    const fixture: Fixture = {
      calls: {
        [callKey("search.issuesAndPullRequests", { q: "x", per_page: 100, page: 1 })]: {
          ok: true,
          data: { items: [{ number: 7 }], total_count: 1 },
        },
        [callKey("repos.getContent", { owner: "a", repo: "b", path: "audits" })]: {
          ok: false,
          status: 404,
          message: "Not Found",
        },
      },
    };
    const client = replayFactory(fixture)("a/b");
    const ok = await client.octokit.rest.search.issuesAndPullRequests({
      q: "x",
      per_page: 100,
      page: 1,
    });
    expect((ok.data.items as { number: number }[])[0].number).toBe(7);
    await expect(
      client.octokit.rest.repos.getContent({ owner: "a", repo: "b", path: "audits" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws on an unrecorded call (incomplete fixture)", async () => {
    const client = replayFactory({ calls: {} })("a/b");
    await expect(
      client.octokit.rest.search.commits({ q: "z", per_page: 100, page: 1 }),
    ).rejects.toThrow(/no recorded response/i);
  });
});
