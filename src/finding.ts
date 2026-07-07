import { readFileSync } from "node:fs";
import type { Finding } from "./types.js";

export function parseFindingFromObject(o: Record<string, unknown>): Finding {
  if (typeof o.title !== "string" || o.title.trim() === "") {
    throw new Error("Finding requires a non-empty title");
  }
  return {
    title: o.title,
    description: typeof o.description === "string" ? o.description : "",
    file: typeof o.file === "string" ? o.file : undefined,
    functions: Array.isArray(o.functions) ? o.functions.map(String) : undefined,
    keys: Array.isArray(o.keys) ? o.keys.map(String) : undefined,
    scopeTag: typeof o.scopeTag === "string" ? o.scopeTag : undefined,
    bugClass: typeof o.bugClass === "string" ? o.bugClass : undefined,
  };
}

export function parseFindingMarkdown(md: string): Finding {
  const lines = md.split(/\r?\n/);
  const heading = lines.find((l) => /^#\s+/.test(l));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : (lines[0]?.trim() ?? "");
  const field = (name: string): string | undefined => {
    const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "i");
    for (const l of lines) {
      const m = re.exec(l);
      if (m) return m[1].trim();
    }
    return undefined;
  };
  const csv = (v?: string): string[] | undefined =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const body = lines
    .filter((l) => l !== heading && !/^(File|Functions?|Keys|Scope-?Tag|Bug-?Class)\s*:/i.test(l))
    .join("\n")
    .trim();
  return {
    title,
    description: body,
    file: field("File"),
    functions: csv(field("Functions") ?? field("Function")),
    keys: csv(field("Keys")),
    scopeTag: field("Scope-Tag") ?? field("ScopeTag"),
    bugClass: field("Bug-Class") ?? field("BugClass"),
  };
}

export function loadFindingFromFile(path: string): Finding {
  const raw = readFileSync(path, "utf8");
  if (path.toLowerCase().endsWith(".json")) {
    return parseFindingFromObject(JSON.parse(raw) as Record<string, unknown>);
  }
  return parseFindingMarkdown(raw);
}
