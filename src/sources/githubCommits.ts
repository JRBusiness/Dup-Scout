import type { RawMatch, Source } from "../types.js";
import { keyTerms } from "./query.js";
import { SEARCH_PER_PAGE, SNIPPET_LEN } from "./constants.js";

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
    const q = `repo:${ctx.client.owner}/${ctx.client.repo} ${keyTerms(ctx.keys)}`.trim();

    if (ctx.dryRun) {
      ctx.log(`[github-commits] search: ${q}`);
      if (ctx.finding.scopeTag && ctx.finding.file) {
        ctx.log(
          `[github-commits] compare: ${ctx.finding.scopeTag}...HEAD path=${ctx.finding.file}`,
        );
      }
      return { matches: [] };
    }

    const res = await ctx.client.octokit.rest.search.commits({ q, per_page: SEARCH_PER_PAGE });
    for (const it of res.data.items as CommitItem[]) {
      matches.push({
        sourceId: "github-commits",
        id: it.sha.slice(0, 7),
        url: it.html_url,
        title: it.commit.message.split("\n")[0],
        snippet: it.commit.message.slice(0, SNIPPET_LEN),
      });
    }
    const total = res.data.total_count ?? matches.length;
    if (total > res.data.items.length) {
      ctx.log(
        `[github-commits] ${total} commits matched but only the top ${res.data.items.length} were fetched; ` +
          `narrow the finding (add function/error names) for better recall.`,
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
