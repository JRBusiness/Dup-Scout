import { createGithubClient, type GithubClient } from "./github/client.js";
import { makeBudget } from "./github/retrieval.js";
import { extractKeys } from "./keys.js";
import { scoreMatch, aggregate, THRESHOLDS } from "./score.js";
import { defaultRegistry, SourceRegistry } from "./sources/index.js";
import type {
  Finding,
  FetchFn,
  Match,
  SearchContext,
  Source,
  SourceResult,
  Verdict,
} from "./types.js";

export interface RunOptions {
  repo: string;
  finding: Finding;
  sources?: string[];
  token?: string;
  minScore?: number;
  dryRun?: boolean;
  fetch?: FetchFn;
  log?: (m: string) => void;
  registry?: SourceRegistry;
  clientFactory?: (repo: string, token?: string) => GithubClient;
}

async function safeSearch(source: Source, ctx: SearchContext): Promise<SourceResult> {
  try {
    return await source.search(ctx);
  } catch (err) {
    ctx.log(`[${source.id}] failed: ${(err as Error).message}`);
    return {
      matches: [],
      notes: [`Source ${source.id} failed: ${(err as Error).message}`],
    };
  }
}

export async function run(opts: RunOptions): Promise<Verdict> {
  const client = (opts.clientFactory ?? createGithubClient)(opts.repo, opts.token);
  const keys = extractKeys(opts.finding);
  const registry = opts.registry ?? defaultRegistry();
  const sources = registry.select(opts.sources);
  const log = opts.log ?? ((): void => {});
  const budget = makeBudget();

  const ctx: SearchContext = {
    client,
    finding: opts.finding,
    keys,
    dryRun: opts.dryRun,
    fetch: opts.fetch,
    log,
    budget,
  };

  const results = await Promise.all(sources.map((s) => safeSearch(s, ctx)));
  const rawMatches = results.flatMap((r) => r.matches);
  const notes = results.flatMap((r) => r.notes ?? []);

  const minScore = opts.minScore ?? THRESHOLDS.report;
  const scored: Match[] = rawMatches
    .map((r) => scoreMatch(r, keys, opts.finding))
    .filter((m) => m.score >= minScore);

  const verdict = aggregate(scored, opts.finding);
  verdict.notes = [...verdict.notes, ...notes];
  return verdict;
}
