import type { RawMatch, Source } from "../types.js";
import { keyTerms } from "./query.js";

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
    const res = await ctx.client.octokit.rest.search.code({ q, per_page: 20 });
    const matches = (res.data.items as CodeItem[]).map((it): RawMatch => ({
      sourceId: "github-code",
      id: it.path,
      url: it.html_url,
      title: `code: ${it.path}`,
      filePath: it.path,
    }));
    return { matches };
  },
};
