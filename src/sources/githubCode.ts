import type { RawMatch, Source } from "../types.js";
import { highSignalTerms, keyTerms } from "./query.js";
import { SEARCH_PER_PAGE } from "./constants.js";
import { makeBudget, runSearches } from "../github/retrieval.js";

interface CodeItem {
  path: string;
  html_url: string;
}

export const githubCode: Source = {
  id: "github-code",
  enabledByDefault: true,
  async search(ctx) {
    // Prefer distinctive identifiers for code search; fall back to the OR union.
    const signal = highSignalTerms(ctx.keys);
    const base = `repo:${ctx.client.owner}/${ctx.client.repo}`;
    const queries =
      signal.length > 0
        ? signal.map((t) => `${base} ${t}`)
        : keyTerms(ctx.keys)
          ? [`${base} ${keyTerms(ctx.keys)}`]
          : [];
    if (ctx.dryRun) {
      for (const q of queries) ctx.log(`[github-code] ${q}`);
      return { matches: [] };
    }
    if (queries.length === 0) return { matches: [] };
    // NOTE: GitHub's `search/code` REST endpoint is deprecated and scheduled for
    // removal (~2026-09-27). This source will need to migrate to the GraphQL
    // search API (or another code-search mechanism) before then.
    const budget = ctx.budget ?? makeBudget();
    const { items, truncated } = await runSearches<CodeItem>(
      queries,
      (q, page) => ctx.client.octokit.rest.search.code({ q, per_page: SEARCH_PER_PAGE, page }),
      (it) => it.path,
      { budget },
    );
    const matches = items.map((it): RawMatch => ({
      sourceId: "github-code",
      id: it.path,
      url: it.html_url,
      title: `code: ${it.path}`,
      filePath: it.path,
    }));
    if (truncated) {
      ctx.log(`[github-code] result set was truncated (rate/page/budget limit).`);
    }
    return { matches };
  },
};
