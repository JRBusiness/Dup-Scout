import { createGithubClient, type GithubClient } from "../src/github/client.js";

export type FixtureEntry =
  { ok: true; data: unknown } | { ok: false; status: number; message: string };

export interface Fixture {
  calls: Record<string, FixtureEntry>;
}

export function callKey(method: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});
  return `${method}::${JSON.stringify(sorted)}`;
}

// The octokit methods the sources call. Each is (params) => Promise<{ data }>.
const METHODS = [
  "search.issuesAndPullRequests",
  "search.commits",
  "search.code",
  "repos.listReleases",
  "repos.compareCommitsWithBasehead",
  "repos.getContent",
] as const;
type Method = (typeof METHODS)[number];

function setPath(root: Record<string, unknown>, dotted: string, fn: unknown): void {
  const [a, b] = dotted.split(".");
  const ns = (root[a] as Record<string, unknown>) ?? {};
  ns[b] = fn;
  root[a] = ns;
}

function fakeOctokit(handler: (m: Method, params: Record<string, unknown>) => Promise<unknown>) {
  const rest: Record<string, unknown> = {};
  for (const m of METHODS) {
    setPath(rest, m, (params: Record<string, unknown> = {}) => handler(m, params));
  }
  return { rest } as unknown as GithubClient["octokit"];
}

export function replayFactory(fixture: Fixture): (repo: string, token?: string) => GithubClient {
  return (repo) => {
    const [owner, name] = repo.split("/");
    const octokit = fakeOctokit(async (m, params) => {
      const key = callKey(m, params);
      const entry = fixture.calls[key];
      if (!entry) throw new Error(`replay: no recorded response for ${key}`);
      if (!entry.ok) {
        throw Object.assign(new Error(entry.message), { status: entry.status });
      }
      return { data: entry.data };
    });
    return { octokit, owner, repo: name };
  };
}

export function recordFactory(
  fixture: Fixture,
  token?: string,
): (repo: string, token?: string) => GithubClient {
  return (repo) => {
    const real = createGithubClient(repo, token);
    const octokit = fakeOctokit(async (m, params) => {
      const key = callKey(m, params);
      const [a, b] = m.split(".");
      const nsAny = (real.octokit.rest as unknown as Record<string, Record<string, unknown>>)[a];
      const method = nsAny[b] as (p: unknown) => Promise<{ data: unknown }>;
      try {
        const res = await method(params);
        fixture.calls[key] = { ok: true, data: res.data };
        return { data: res.data };
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500;
        fixture.calls[key] = { ok: false, status, message: (err as Error).message };
        throw err;
      }
    });
    return { octokit, owner: real.owner, repo: real.repo };
  };
}
