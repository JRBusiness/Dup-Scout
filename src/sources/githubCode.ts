import type { RawMatch, Source } from "../types.js";
import { keyTerms } from "./query.js";
import { SEARCH_PER_PAGE } from "./constants.js";

interface CodeItem {
  path: string;
  html_url: string;
}

export const githubCode: Source = {
  id: "github-code",
  enabledByDefault: true,
  async search(ctx) {
    const fnTerms = ctx.keys.filter((k) => k.kind === "function").map((k) => k.term);
    const terms = fnTerms.length > 0 ? fnTerms.join(" OR ") : keyTerms(ctx.keys);
    const q = `repo:${ctx.client.owner}/${ctx.client.repo} ${terms}`.trim();
    if (ctx.dryRun) {
      ctx.log(`[github-code] ${q}`);
      return { matches: [] };
    }
    // NOTE: GitHub's `search/code` REST endpoint is deprecated and scheduled for
    // removal (~2026-09-27). This source will need to migrate to the GraphQL
    // search API (or another code-search mechanism) before then.
    const res = await ctx.client.octokit.rest.search.code({ q, per_page: SEARCH_PER_PAGE });
    const matches = (res.data.items as CodeItem[]).map((it): RawMatch => ({
      sourceId: "github-code",
      id: it.path,
      url: it.html_url,
      title: `code: ${it.path}`,
      filePath: it.path,
    }));
    const total = res.data.total_count ?? matches.length;
    if (total > matches.length) {
      ctx.log(
        `[github-code] ${total} code hits matched but only the top ${matches.length} were fetched; ` +
          `narrow the finding (add function/error names) for better recall.`,
      );
    }
    return { matches };
  },
};
