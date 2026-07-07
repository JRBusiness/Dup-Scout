import type { RawMatch, Source } from "../types.js";
import { queriesFor } from "./query.js";
import { securitySignals } from "./signals.js";
import { SEARCH_PER_PAGE, SNIPPET_LEN } from "./constants.js";
import { makeBudget, runSearches } from "../github/retrieval.js";

interface SearchItem {
  number: number;
  html_url: string;
  title: string;
  state: string;
  body?: string | null;
  pull_request?: { merged_at?: string | null };
}

export const githubPrs: Source = {
  id: "github-prs",
  enabledByDefault: true,
  async search(ctx) {
    const queries = queriesFor(ctx, "type:pr");
    if (ctx.dryRun) {
      for (const q of queries) ctx.log(`[github-prs] ${q}`);
      return { matches: [] };
    }
    const budget = ctx.budget ?? makeBudget();
    const { items, truncated } = await runSearches<SearchItem>(
      queries,
      (q, page) =>
        ctx.client.octokit.rest.search.issuesAndPullRequests({
          q,
          per_page: SEARCH_PER_PAGE,
          page,
        }),
      (it) => `#${it.number}`,
      { budget },
    );
    const matches = items.map((it): RawMatch => ({
      sourceId: "github-prs",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.pull_request?.merged_at ? "merged" : it.state,
      snippet: (it.body ?? "").slice(0, SNIPPET_LEN),
      signals: securitySignals(it.title),
    }));
    if (truncated) {
      ctx.log(
        `[github-prs] result set was truncated (rate/page/budget limit); ` +
          `add distinctive terms (function/error names) for better recall.`,
      );
    }
    return { matches };
  },
};
