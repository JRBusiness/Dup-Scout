import type { Verdict } from "../types.js";

export function renderMarkdown(v: Verdict): string {
  const lines: string[] = [];
  lines.push("## Duplicate check");
  lines.push("");
  lines.push(`**Verdict:** ${v.label}  ·  **Confidence:** ${Math.round(v.confidence * 100)}%`);
  lines.push("");
  if (v.matches.length > 0) {
    lines.push("| Score | Source | Ref | State | Title |");
    lines.push("|---|---|---|---|---|");
    for (const m of v.matches) {
      lines.push(
        `| ${m.score} | ${m.sourceId} | [${m.id}](${m.url}) | ${m.state ?? "-"} | ${m.title.replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("_No prior-art matches found in enabled sources._");
    lines.push("");
  }
  if (v.notes.length > 0) {
    lines.push("**Also check manually:**");
    for (const n of v.notes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}
