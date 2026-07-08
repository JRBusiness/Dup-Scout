import { createGithubClient, type GithubClient } from "../src/github/client.js";
import { SNIPPET_LEN } from "../src/sources/constants.js";

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

// Characters of a body/message/patch the sources ever read (src SNIPPET_LEN).
// Recording the full multi-KB bodies GitHub returns bloats fixtures to tens of
// MB. The recorder keeps only the fields the sources read, with long text cut
// to the same prefix used during scoring. Replay stays behaviorally identical
// while committed fixtures stay small. The data is still recorded from GitHub;
// only unused fields are stripped.
// Slicing at the source's SNIPPET_LEN keeps fixtures at the same boundary the
// sources consume.
const slim = (v: unknown): string | unknown =>
  typeof v === "string" ? v.slice(0, SNIPPET_LEN) : v;

function slimResponse(method: Method, data: unknown): unknown {
  if (method === "search.issuesAndPullRequests") {
    const d = data as {
      total_count?: number;
      incomplete_results?: boolean;
      items?: Record<string, unknown>[];
    };
    return {
      total_count: d.total_count,
      incomplete_results: d.incomplete_results,
      items: (d.items ?? []).map((it) => {
        const pr = it.pull_request as { merged_at?: unknown } | undefined;
        return {
          number: it.number,
          html_url: it.html_url,
          title: it.title,
          state: it.state,
          body: slim(it.body),
          ...(pr ? { pull_request: { merged_at: pr.merged_at ?? null } } : {}),
        };
      }),
    };
  }
  if (method === "search.commits") {
    const d = data as { total_count?: number; items?: Record<string, unknown>[] };
    return {
      total_count: d.total_count,
      items: (d.items ?? []).map((it) => ({
        sha: it.sha,
        html_url: it.html_url,
        commit: { message: slim((it.commit as { message?: unknown } | undefined)?.message ?? "") },
      })),
    };
  }
  if (method === "repos.listReleases") {
    return (data as Record<string, unknown>[]).map((rel) => ({
      name: rel.name,
      tag_name: rel.tag_name,
      html_url: rel.html_url,
      body: slim(rel.body),
    }));
  }
  if (method === "repos.compareCommitsWithBasehead") {
    const d = data as { files?: Record<string, unknown>[] };
    return {
      files: (d.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        patch: slim(f.patch),
      })),
    };
  }
  // search.code / repos.getContent and anything else: keep verbatim (small or
  // 404, and not part of the default benchmark source set).
  return data;
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
        const data = slimResponse(m, res.data);
        fixture.calls[key] = { ok: true, data };
        return { data };
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500;
        fixture.calls[key] = { ok: false, status, message: (err as Error).message };
        throw err;
      }
    });
    return { octokit, owner: real.owner, repo: real.repo };
  };
}
