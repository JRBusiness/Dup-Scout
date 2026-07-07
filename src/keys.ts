import type { Finding, KeyKind, WeightedKey } from "./types.js";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "is",
  "and",
  "or",
  "for",
  "on",
  "with",
  "by",
  "function",
  "contract",
  "value",
  "user",
  "data",
  "when",
  "this",
  "that",
  "can",
  "be",
  "if",
  "via",
  "lets",
  "attacker",
  "runs",
]);

export function extractKeys(finding: Finding): WeightedKey[] {
  const keys: WeightedKey[] = [];
  const push = (term: string, weight: number, kind: KeyKind): void => {
    const t = term.trim();
    if (!t || STOPWORDS.has(t.toLowerCase())) return;
    if (keys.some((k) => k.term.toLowerCase() === t.toLowerCase())) return;
    keys.push({ term: t, weight, kind });
  };

  for (const f of finding.functions ?? []) push(f, 5, "function");
  if (finding.file) {
    push(finding.file, 4, "file");
    const base = finding.file
      .split(/[\\/]/)
      .pop()!
      .replace(/\.[^.]+$/, "");
    push(base, 4, "contract");
  }
  for (const k of finding.keys ?? []) push(k, 4, "invariant");
  if (finding.bugClass) push(finding.bugClass, 3, "pattern");

  const text = `${finding.title} ${finding.description}`;
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{3,}/g)) {
    const w = m[0];
    if (/[a-z][A-Z]/.test(w) || w.includes("_")) push(w, 3, "function");
    else push(w.toLowerCase(), 1, "generic");
  }
  return keys;
}
