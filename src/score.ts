import type { Finding, Match, RawMatch, Verdict, VerdictLabel, WeightedKey } from "./types.js";

export const THRESHOLDS = { report: 45, partial: 55, duplicate: 75 } as const;

export function scoreMatch(raw: RawMatch, keys: WeightedKey[], finding: Finding): Match {
  const haystack = `${raw.title} ${raw.snippet ?? ""} ${raw.filePath ?? ""}`.toLowerCase();
  const matchedKeys: string[] = [];
  let overlap = 0;
  let totalWeight = 0;
  for (const k of keys) {
    totalWeight += k.weight;
    if (haystack.includes(k.term.toLowerCase())) {
      overlap += k.weight;
      matchedKeys.push(k.term);
    }
  }
  let score = totalWeight > 0 ? (overlap / totalWeight) * 100 : 0;

  const fns = (finding.functions ?? []).map((f) => f.toLowerCase()).filter(Boolean);
  if (fns.some((f) => haystack.includes(f))) score += 15;
  if (finding.file && raw.filePath && raw.filePath.toLowerCase() === finding.file.toLowerCase()) {
    score += 15;
  }
  if (raw.signals?.includes("security-title")) score += 10;
  if (raw.state === "merged" || raw.state === "closed") score += 5;
  if (raw.signals?.includes("audit-ack")) score += 20;
  if (raw.signals?.includes("silent-fix")) score += 25;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { ...raw, matchedKeys, score };
}

export function aggregate(matches: Match[], finding: Finding): Verdict {
  const ranked = [...matches].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    return { label: "NOVEL", confidence: 0.5, matches: [], notes: [] };
  }
  const top = ranked[0];
  const fns = (finding.functions ?? []).map((f) => f.toLowerCase());
  const sameFunction = top.matchedKeys.some((k) => fns.includes(k.toLowerCase()));
  const sourceCount = new Set(
    ranked.filter((m) => m.score >= THRESHOLDS.partial).map((m) => m.sourceId),
  ).size;

  let label: VerdictLabel;
  if (top.signals?.includes("audit-ack")) label = "KNOWN-ISSUE";
  else if (top.signals?.includes("silent-fix")) label = "SILENTLY-FIXED";
  else if (top.score >= THRESHOLDS.duplicate && sameFunction) label = "DUPLICATE";
  else if (top.score >= THRESHOLDS.partial) label = "PARTIAL-OVERLAP";
  else label = "NOVEL";

  const confidence = Math.min(1, (top.score / 100) * 0.7 + Math.min(sourceCount, 3) * 0.1);
  return { label, confidence: Number(confidence.toFixed(2)), matches: ranked, notes: [] };
}
