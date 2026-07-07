import type { RawMatch, Source } from "../../types.js";

export function contestUrls(repo: string, terms: string[]): string[] {
  const q = encodeURIComponent([repo, ...terms].filter(Boolean).join(" "));
  return [
    `https://code4rena.com/reports?search=${q}`,
    `https://audits.sherlock.xyz/contests?search=${q}`,
    `https://cantina.xyz/portfolio?search=${q}`,
    `https://google.com/search?q=${encodeURIComponent(`immunefi known issues ${repo} ${terms.join(" ")}`)}`,
  ];
}

export const contests: Source = {
  id: "contests",
  enabledByDefault: true,
  async search(ctx) {
    const terms = ctx.keys.filter((k) => k.kind !== "generic").map((k) => k.term);
    const urls = contestUrls(ctx.client.repo, terms);

    if (ctx.dryRun) {
      ctx.log(`[contests] candidate URLs: ${urls.length}`);
      return { matches: [], notes: urls.map((u) => `Manual check (contest platform): ${u}`) };
    }

    if (!ctx.fetch) {
      return {
        matches: [],
        notes: urls.map((u) => `Manual check (contest platform): ${u}`),
      };
    }

    const matches: RawMatch[] = [];
    const lowerTerms = terms.map((t) => t.toLowerCase());
    for (const url of urls) {
      try {
        const body = (await ctx.fetch(url)).toLowerCase();
        const hit = lowerTerms.find((t) => body.includes(t));
        if (hit) {
          matches.push({
            sourceId: "contests",
            id: url,
            url,
            title: `contest hit for "${hit}"`,
            signals: ["contest"],
          });
        }
      } catch {
        continue;
      }
    }
    return { matches, notes: matches.length === 0 ? urls.map((u) => `Manual check: ${u}`) : [] };
  },
};
