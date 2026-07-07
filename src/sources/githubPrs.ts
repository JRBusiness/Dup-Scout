import type { RawMatch, Source } from "../types.js";
import { buildQuery } from "./query.js";
import { securitySignals } from "./signals.js";

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
    const res = await ctx.client.octokit.rest.search.issuesAndPullRequests({ q, per_page: 30 });
    const matches = (res.data.items as SearchItem[]).map((it): RawMatch => ({
      sourceId: "github-prs",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.pull_request?.merged_at ? "merged" : it.state,
      snippet: (it.body ?? "").slice(0, 300),
      signals: securitySignals(it.title),
    }));
    return { matches };
  },
};
