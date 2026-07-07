import type { RawMatch, Source } from "../../types.js";

const CANDIDATE_DIRS = ["audits", "audit", "docs/audits", "security"];
const TEXT_EXT = /\.(md|markdown|txt)$/i;
const PDF_EXT = /\.pdf$/i;
const ACK_RE =
  /\b(acknowledged|known issue|won'?t fix|wontfix|by design|out of scope|accepted risk)\b/i;

interface DirEntry {
  type: string;
  name: string;
  path: string;
  download_url?: string | null;
  html_url: string;
}

export const auditReports: Source = {
  id: "audit-reports",
  enabledByDefault: true,
  async search(ctx) {
    const matches: RawMatch[] = [];
    const notes: string[] = [];
    const terms = ctx.keys.filter((k) => k.kind !== "generic").map((k) => k.term.toLowerCase());

    if (ctx.dryRun) {
      ctx.log(`[audit-reports] scan dirs: ${CANDIDATE_DIRS.join(", ")}`);
      return { matches, notes };
    }

    for (const dir of CANDIDATE_DIRS) {
      let entries: DirEntry[];
      try {
        const res = await ctx.client.octokit.rest.repos.getContent({
          owner: ctx.client.owner,
          repo: ctx.client.repo,
          path: dir,
        });
        if (!Array.isArray(res.data)) continue;
        entries = res.data as unknown as DirEntry[];
      } catch {
        continue; // directory absent
      }

      for (const entry of entries) {
        if (entry.type !== "file") continue;
        if (PDF_EXT.test(entry.name)) {
          notes.push(`Manual check (PDF audit report): ${entry.html_url}`);
          continue;
        }
        if (!TEXT_EXT.test(entry.name)) continue;
        try {
          const file = await ctx.client.octokit.rest.repos.getContent({
            owner: ctx.client.owner,
            repo: ctx.client.repo,
            path: entry.path,
          });
          const data = file.data as { content?: string; encoding?: string };
          if (!data.content) continue;
          const text = Buffer.from(
            data.content,
            (data.encoding as BufferEncoding) ?? "base64",
          ).toString("utf8");
          const lower = text.toLowerCase();
          const hit = terms.find((t) => lower.includes(t));
          if (!hit) continue;
          const idx = lower.indexOf(hit);
          const window = text.slice(Math.max(0, idx - 200), idx + 200);
          const signals = ACK_RE.test(window) ? ["audit-ack"] : [];
          matches.push({
            sourceId: "audit-reports",
            id: entry.path,
            url: entry.html_url,
            title: `audit report: ${entry.name}`,
            snippet: window.trim().slice(0, 300),
            signals,
          });
        } catch {
          continue;
        }
      }
    }
    return { matches, notes };
  },
};
