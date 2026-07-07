import type { RawMatch, Source } from "../types.js";
import { buildQuery } from "./query.js";
import { securitySignals } from "./signals.js";
import { SEARCH_PER_PAGE, SNIPPET_LEN } from "./constants.js";

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
    const q = buildQuery(ctx, "type:pr");
    if (ctx.dryRun) {
      ctx.log(`[github-prs] ${q}`);
      return { matches: [] };
    }
    const res = await ctx.client.octokit.rest.search.issuesAndPullRequests({
      q,
      per_page: SEARCH_PER_PAGE,
    });
    const matches = (res.data.items as SearchItem[]).map((it): RawMatch => ({
      sourceId: "github-prs",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.pull_request?.merged_at ? "merged" : it.state,
      snippet: (it.body ?? "").slice(0, SNIPPET_LEN),
      signals: securitySignals(it.title),
    }));
    const total = res.data.total_count ?? matches.length;
    if (total > matches.length) {
      ctx.log(
        `[github-prs] ${total} PRs matched but only the top ${matches.length} were fetched; ` +
          `narrow the finding (add function/error names) for better recall.`,
      );
    }
    return { matches };
  },
};
