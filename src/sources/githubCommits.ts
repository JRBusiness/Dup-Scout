import type { RawMatch, Source } from "../types.js";
import { queriesFor } from "./query.js";
import { SNIPPET_LEN } from "./constants.js";
import { makeBudget, runSearches } from "../github/retrieval.js";

interface CommitItem {
  sha: string;
  html_url: string;
  commit: { message: string };
}
interface CompareFile {
  filename: string;
  status: string;
  patch?: string;
}

export const githubCommits: Source = {
  id: "github-commits",
  enabledByDefault: true,
  async search(ctx) {
    const matches: RawMatch[] = [];
    const queries = queriesFor(ctx, "");

    if (ctx.dryRun) {
      for (const q of queries) ctx.log(`[github-commits] search: ${q}`);
      if (ctx.finding.scopeTag && ctx.finding.file) {
        ctx.log(
          `[github-commits] compare: ${ctx.finding.scopeTag}...HEAD path=${ctx.finding.file}`,
        );
      }
      return { matches: [] };
    }

    const budget = ctx.budget ?? makeBudget();
    const { items, truncated } = await runSearches<CommitItem>(
      queries,
      (q, page) => ctx.client.octokit.rest.search.commits({ q, per_page: 100, page }),
      (it) => it.sha,
      { budget },
    );
    for (const it of items) {
      matches.push({
        sourceId: "github-commits",
        id: it.sha.slice(0, 7),
        url: it.html_url,
        title: it.commit.message.split("\n")[0],
        snippet: it.commit.message.slice(0, SNIPPET_LEN),
      });
    }
    if (truncated) {
      ctx.log(
        `[github-commits] result set was truncated (rate/page/budget limit); ` +
          `add distinctive terms (function/error names) for better recall.`,
      );
    }

    // Silent-fix detection: did the affected file change after the in-scope tag?
    if (ctx.finding.scopeTag && ctx.finding.file) {
      const cmp = await ctx.client.octokit.rest.repos.compareCommitsWithBasehead({
        owner: ctx.client.owner,
        repo: ctx.client.repo,
        basehead: `${ctx.finding.scopeTag}...HEAD`,
      });
      const files = (cmp.data.files ?? []) as CompareFile[];
      const hit = files.find((f) => f.filename.toLowerCase() === ctx.finding.file!.toLowerCase());
      if (hit) {
        matches.push({
          sourceId: "github-commits",
          id: `${ctx.finding.scopeTag}...HEAD`,
          url: `https://github.com/${ctx.client.owner}/${ctx.client.repo}/compare/${ctx.finding.scopeTag}...HEAD`,
          title: `Affected file ${hit.filename} changed after ${ctx.finding.scopeTag}`,
          filePath: hit.filename,
          snippet: (hit.patch ?? "").slice(0, SNIPPET_LEN),
          signals: ["silent-fix"],
        });
      }
    }

    return { matches };
  },
};
