import type { RawMatch, Source } from "../types.js";
import { SEARCH_PER_PAGE, SNIPPET_LEN } from "./constants.js";
import { makeBudget } from "../github/retrieval.js";

interface Release {
  name: string | null;
  tag_name: string;
  html_url: string;
  body?: string | null;
}

export const githubReleases: Source = {
  id: "github-releases",
  enabledByDefault: true,
  async search(ctx) {
    if (ctx.dryRun) {
      ctx.log(`[github-releases] list releases for ${ctx.client.owner}/${ctx.client.repo}`);
      return { matches: [] };
    }
    const budget = ctx.budget ?? makeBudget();
    if (budget.remaining <= 0) {
      ctx.log(`[github-releases] skipped (request budget exhausted).`);
      return { matches: [] };
    }
    budget.remaining -= 1;
    const res = await ctx.client.octokit.rest.repos.listReleases({
      owner: ctx.client.owner,
      repo: ctx.client.repo,
      per_page: SEARCH_PER_PAGE,
    });
    const terms = ctx.keys.filter((k) => k.kind !== "generic").map((k) => k.term.toLowerCase());
    const matches: RawMatch[] = [];
    for (const rel of res.data as Release[]) {
      const hay = `${rel.name ?? ""} ${rel.body ?? ""}`.toLowerCase();
      if (terms.some((t) => hay.includes(t))) {
        matches.push({
          sourceId: "github-releases",
          id: rel.tag_name,
          url: rel.html_url,
          title: rel.name ?? rel.tag_name,
          snippet: (rel.body ?? "").slice(0, SNIPPET_LEN),
        });
      }
    }
    if (res.data.length >= SEARCH_PER_PAGE) {
      ctx.log(
        `[github-releases] scanned the latest ${SEARCH_PER_PAGE} releases only; ` +
          `older releases were not checked.`,
      );
    }
    return { matches };
  },
};
