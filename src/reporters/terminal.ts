import type { Verdict } from "../types.js";

export function renderTerminal(v: Verdict): string {
  const lines: string[] = [];
  lines.push(`Verdict: ${v.label}  (confidence ${Math.round(v.confidence * 100)}%)`);
  if (v.matches.length === 0) {
    lines.push("  No prior-art matches in enabled sources.");
  } else {
    lines.push("  Top matches:");
    for (const m of v.matches.slice(0, 10)) {
      lines.push(`    [${m.score}] ${m.sourceId} ${m.id} ${m.state ?? ""}  ${m.title}`);
      lines.push(`          ${m.url}`);
    }
  }
  if (v.notes.length > 0) {
    lines.push("  Manual checks:");
    for (const n of v.notes) lines.push(`    - ${n}`);
  }
  return lines.join("\n");
}
