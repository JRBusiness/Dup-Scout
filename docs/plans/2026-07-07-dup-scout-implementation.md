# Dup-Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `dup-scout`, a publishable Node/TypeScript CLI + library that estimates whether a bug bounty finding is a likely duplicate/known-issue by scanning a target GitHub repo's PRs, issues, commits, releases, and web3 audit sources.

**Architecture:** A stateless engine takes a structured `Finding`, extracts weighted search keys, fans out to a registry of pluggable `Source` modules (each returns `RawMatch[]`), centrally scores every match, and aggregates into a `Verdict` (DUPLICATE / KNOWN-ISSUE / SILENTLY-FIXED / PARTIAL-OVERLAP / NOVEL). Reporters render the verdict as terminal/json/markdown. GitHub access goes through one Octokit wrapper with layered token resolution.

**Tech Stack:** TypeScript (strict, ESM), Node ≥18, `@octokit/rest`, `commander`, build with `tsup`, test with `vitest`, lint with eslint + prettier.

## Global Constraints

- **Node:** `>=18`, ESM only (`"type": "module"`, `moduleResolution: NodeNext`).
- **TypeScript:** `strict: true`, target `ES2022`.
- **npm package name:** `dup-scout` (unscoped). CLI bin name: `dup-scout`.
- **License:** MIT.
- **No live network in tests** — Octokit and fetch are always mocked in `vitest`.
- **Public API surface** (library exports from `src/index.ts`): `run`, and the types `Finding`, `Match`, `Verdict`, `Source`.
- **Commits:** authored solely by the user. Do NOT add `Co-Authored-By` or any Claude/tool attribution to commit messages.
- **Conventional-ish commit messages**, one per task step where the plan says "Commit".

---

## File Structure

```
Dup-Scout/
  src/
    index.ts               # library entry: re-exports run + public types
    cli.ts                 # commander CLI (check + install subcommands), exit codes
    install.ts             # `install` subcommand + Claude/Codex command templates
    engine.ts              # run(): orchestration
    types.ts               # all shared types
    finding.ts             # Finding parsing (object / markdown / file)
    keys.ts                # extractKeys
    score.ts               # scoreMatch, aggregate, THRESHOLDS
    github/
      client.ts            # resolveToken, createGithubClient
    sources/
      index.ts             # SourceRegistry + defaultRegistry
      query.ts             # keyTerms, buildQuery
      signals.ts           # securitySignals
      githubPrs.ts
      githubIssues.ts
      githubCommits.ts
      githubReleases.ts
      githubCode.ts
      web3/
        auditReports.ts
        contests.ts        # guided; contestUrls()
    reporters/
      terminal.ts
      json.ts
      markdown.ts
  test/                    # mirrors src/, *.test.ts
  docs/
    specs/2026-07-07-dup-scout-design.md   # (exists)
    plans/2026-07-07-dup-scout-implementation.md
  package.json  tsconfig.json  tsup.config.ts
  .eslintrc.cjs  .prettierrc  .gitignore   # (.gitignore exists)
  README.md  CHANGELOG.md  LICENSE
  .github/workflows/ci.yml  release.yml
```

---

### Task 1: Project scaffolding & toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `.eslintrc.cjs`, `.prettierrc`
- Create: `src/index.ts`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working build/test/lint toolchain and `src/index.ts` as the library entry (populated in later tasks).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "dup-scout",
  "version": "0.1.0",
  "description": "Prior-art / duplicate checker for bug bounty findings — scans a target repo's PRs, issues, commits, releases, and web3 audit sources.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=18" },
  "bin": { "dup-scout": "dist/cli.js" },
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@octokit/rest": "^20.1.1",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.3.0",
    "tsup": "^8.1.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Write `.eslintrc.cjs` and `.prettierrc`**

`.eslintrc.cjs`:
```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: { node: true, es2022: true },
  parserOptions: { sourceType: "module", ecmaVersion: 2022 },
  ignorePatterns: ["dist", "node_modules"],
};
```

`.prettierrc`:
```json
{ "printWidth": 100, "singleQuote": false, "trailingComma": "all" }
```

- [ ] **Step 5: Write `src/index.ts` placeholder and the smoke test**

`src/index.ts`:
```ts
export const VERSION = "0.1.0";
```

`test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index.js";

describe("toolchain", () => {
  it("exposes a version string", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 6: Install deps and verify toolchain**

Run: `npm install`
Then: `npm test`
Expected: 1 passing test.
Then: `npm run build`
Expected: `dist/index.js`, `dist/cli.js` (cli is empty for now — acceptable), `.d.ts` emitted, no errors.

> Note: `npm run build` may warn that `src/cli.ts` does not exist yet. If tsup errors on the missing entry, create a one-line `src/cli.ts` with `export {};` to satisfy the entry; it is fully implemented in Task 13.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold TypeScript toolchain (tsup, vitest, eslint)"
```

---

### Task 2: Core types & Finding parsing

**Files:**
- Create: `src/types.ts`, `src/finding.ts`
- Test: `test/finding.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types: `Finding`, `KeyKind`, `WeightedKey`, `RawMatch`, `Match`, `VerdictLabel`, `Verdict`, `SearchContext`, `SourceResult`, `Source`, `FetchFn`.
  - `parseFindingFromObject(o): Finding`, `parseFindingMarkdown(md): Finding`, `loadFindingFromFile(path): Finding`.

- [ ] **Step 1: Write `src/types.ts`**

```ts
export interface Finding {
  title: string;
  description: string;
  file?: string;
  functions?: string[];
  keys?: string[];
  scopeTag?: string;
  bugClass?: string;
}

export type KeyKind =
  | "function" | "file" | "contract" | "event" | "error"
  | "modifier" | "invariant" | "selector" | "pattern" | "generic";

export interface WeightedKey {
  term: string;
  weight: number;
  kind: KeyKind;
}

export interface RawMatch {
  sourceId: string;
  id: string;
  url: string;
  title: string;
  state?: string;      // open | closed | merged
  snippet?: string;
  filePath?: string;
  signals?: string[];  // "security-title" | "merged" | "audit-ack" | "silent-fix" | "contest"
}

export interface Match extends RawMatch {
  matchedKeys: string[];
  score: number;       // 0..100
}

export type VerdictLabel =
  | "DUPLICATE" | "KNOWN-ISSUE" | "SILENTLY-FIXED"
  | "PARTIAL-OVERLAP" | "NOVEL";

export interface Verdict {
  label: VerdictLabel;
  confidence: number;  // 0..1
  matches: Match[];
  notes: string[];
}

export type FetchFn = (url: string) => Promise<string>;

export interface SearchContext {
  client: import("./github/client.js").GithubClient;
  finding: Finding;
  keys: WeightedKey[];
  dryRun?: boolean;
  fetch?: FetchFn;
  log: (msg: string) => void;
}

export interface SourceResult {
  matches: RawMatch[];
  notes?: string[];
}

export interface Source {
  id: string;
  enabledByDefault: boolean;
  search(ctx: SearchContext): Promise<SourceResult>;
}
```

- [ ] **Step 2: Write the failing test `test/finding.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseFindingFromObject, parseFindingMarkdown } from "../src/finding.js";

describe("parseFindingFromObject", () => {
  it("maps fields and defaults description", () => {
    const f = parseFindingFromObject({ title: "Reentrancy in claim", functions: ["claim"] });
    expect(f.title).toBe("Reentrancy in claim");
    expect(f.description).toBe("");
    expect(f.functions).toEqual(["claim"]);
  });
  it("throws without a title", () => {
    expect(() => parseFindingFromObject({})).toThrow(/title/);
  });
});

describe("parseFindingMarkdown", () => {
  it("extracts title, body, and fields", () => {
    const md = [
      "# Rounding error in _settle",
      "",
      "The _settle() path rounds down and lets an attacker drain dust.",
      "File: src/Vault.sol",
      "Functions: _settle, claim",
      "Scope-Tag: v1.2.0",
    ].join("\n");
    const f = parseFindingMarkdown(md);
    expect(f.title).toBe("Rounding error in _settle");
    expect(f.file).toBe("src/Vault.sol");
    expect(f.functions).toEqual(["_settle", "claim"]);
    expect(f.scopeTag).toBe("v1.2.0");
    expect(f.description).toContain("rounds down");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/finding.test.ts`
Expected: FAIL — cannot find module `../src/finding.js`.

- [ ] **Step 4: Write `src/finding.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/finding.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/finding.ts test/finding.test.ts
git commit -m "feat: core types and finding parsing"
```

---

### Task 3: Key extraction

**Files:**
- Create: `src/keys.ts`
- Test: `test/keys.test.ts`

**Interfaces:**
- Consumes: `Finding`, `WeightedKey`, `KeyKind` from `src/types.ts`.
- Produces: `extractKeys(finding: Finding): WeightedKey[]`.

- [ ] **Step 1: Write the failing test `test/keys.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { extractKeys } from "../src/keys.js";

describe("extractKeys", () => {
  it("weights explicit function and file keys highest and dedupes", () => {
    const keys = extractKeys({
      title: "Reentrancy in claim lets attacker drain",
      description: "the claim() function reenters via _settle",
      functions: ["claim"],
      file: "src/Vault.sol",
      bugClass: "reentrancy",
    });
    const claim = keys.find((k) => k.term === "claim");
    expect(claim?.kind).toBe("function");
    expect(claim?.weight).toBeGreaterThanOrEqual(5);
    expect(keys.some((k) => k.term === "Vault" && k.kind === "contract")).toBe(true);
    expect(keys.some((k) => k.term === "reentrancy" && k.kind === "pattern")).toBe(true);
    // dedupe: "claim" appears once even though it is in title, desc, and functions
    expect(keys.filter((k) => k.term.toLowerCase() === "claim").length).toBe(1);
  });

  it("drops stopwords and marks camelCase/underscore identifiers as function kind", () => {
    const keys = extractKeys({ title: "The value of _settle", description: "when getReward runs" });
    expect(keys.some((k) => k.term.toLowerCase() === "the")).toBe(false);
    expect(keys.some((k) => k.term === "_settle" && k.kind === "function")).toBe(true);
    expect(keys.some((k) => k.term === "getReward" && k.kind === "function")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/keys.test.ts`
Expected: FAIL — cannot find module `../src/keys.js`.

- [ ] **Step 3: Write `src/keys.ts`**

```ts
import type { Finding, KeyKind, WeightedKey } from "./types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "and", "or", "for", "on", "with",
  "by", "function", "contract", "value", "user", "data", "when", "this", "that",
  "can", "be", "if", "via", "lets", "attacker", "runs",
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
    const base = finding.file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/keys.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/keys.ts test/keys.test.ts
git commit -m "feat: weighted key extraction from findings"
```

---

### Task 4: Scoring & aggregation

**Files:**
- Create: `src/score.ts`
- Test: `test/score.test.ts`

**Interfaces:**
- Consumes: `RawMatch`, `Match`, `WeightedKey`, `Finding`, `Verdict`, `VerdictLabel`.
- Produces: `THRESHOLDS`, `scoreMatch(raw, keys, finding): Match`, `aggregate(matches: Match[], finding): Verdict`.

- [ ] **Step 1: Write the failing test `test/score.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scoreMatch, aggregate, THRESHOLDS } from "../src/score.js";
import type { RawMatch, WeightedKey, Finding } from "../src/types.js";

const finding: Finding = {
  title: "Reentrancy in claim",
  description: "",
  functions: ["claim"],
  file: "src/Vault.sol",
};
const keys: WeightedKey[] = [
  { term: "claim", weight: 5, kind: "function" },
  { term: "Vault", weight: 4, kind: "contract" },
  { term: "reentrancy", weight: 3, kind: "pattern" },
];

describe("scoreMatch", () => {
  it("scores an exact-function merged PR highly", () => {
    const raw: RawMatch = {
      sourceId: "github-prs", id: "#12", url: "u", title: "Fix reentrancy in claim()",
      state: "merged", signals: ["security-title"],
    };
    const m = scoreMatch(raw, keys, finding);
    expect(m.matchedKeys).toContain("claim");
    expect(m.score).toBeGreaterThanOrEqual(THRESHOLDS.duplicate);
  });
  it("scores an unrelated issue low", () => {
    const raw: RawMatch = { sourceId: "github-issues", id: "#3", url: "u", title: "typo in README" };
    expect(scoreMatch(raw, keys, finding).score).toBeLessThan(THRESHOLDS.partial);
  });
});

describe("aggregate", () => {
  const mk = (over: Partial<RawMatch>): RawMatch => ({
    sourceId: "github-prs", id: "#1", url: "u", title: "Fix reentrancy in claim()",
    state: "merged", signals: ["security-title"], ...over,
  });
  it("returns NOVEL when there are no matches", () => {
    expect(aggregate([], finding).label).toBe("NOVEL");
  });
  it("returns DUPLICATE on a high-score same-function match", () => {
    const m = scoreMatch(mk({}), keys, finding);
    expect(aggregate([m], finding).label).toBe("DUPLICATE");
  });
  it("returns KNOWN-ISSUE when top match carries audit-ack", () => {
    const m = scoreMatch(mk({ sourceId: "audit-reports", signals: ["audit-ack"] }), keys, finding);
    expect(aggregate([m], finding).label).toBe("KNOWN-ISSUE");
  });
  it("returns SILENTLY-FIXED when top match carries silent-fix", () => {
    const m = scoreMatch(mk({ sourceId: "github-commits", signals: ["silent-fix"], filePath: "src/Vault.sol" }), keys, finding);
    expect(aggregate([m], finding).label).toBe("SILENTLY-FIXED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/score.test.ts`
Expected: FAIL — cannot find module `../src/score.js`.

- [ ] **Step 3: Write `src/score.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/score.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/score.ts test/score.test.ts
git commit -m "feat: match scoring and verdict aggregation"
```

---

### Task 5: GitHub client wrapper

**Files:**
- Create: `src/github/client.ts`
- Test: `test/github-client.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `interface GithubClient { octokit: Octokit; owner: string; repo: string; }`
  - `resolveToken(o?: { explicit?: string; env?: NodeJS.ProcessEnv; ghTokenReader?: () => string | undefined }): string | undefined`
  - `createGithubClient(repo: string, token?: string): GithubClient`

- [ ] **Step 1: Write the failing test `test/github-client.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveToken, createGithubClient } from "../src/github/client.js";

describe("resolveToken", () => {
  it("prefers explicit over env over gh CLI", () => {
    expect(resolveToken({ explicit: "X", env: { GITHUB_TOKEN: "Y" } })).toBe("X");
  });
  it("falls back to GITHUB_TOKEN then GH_TOKEN", () => {
    expect(resolveToken({ env: { GITHUB_TOKEN: "Y" } })).toBe("Y");
    expect(resolveToken({ env: { GH_TOKEN: "Z" } })).toBe("Z");
  });
  it("falls back to gh CLI reader", () => {
    expect(resolveToken({ env: {}, ghTokenReader: () => "GH" })).toBe("GH");
  });
  it("returns undefined when nothing is available", () => {
    expect(resolveToken({ env: {}, ghTokenReader: () => undefined })).toBeUndefined();
  });
});

describe("createGithubClient", () => {
  it("parses owner/repo", () => {
    const c = createGithubClient("acme/vault", "tok");
    expect(c.owner).toBe("acme");
    expect(c.repo).toBe("vault");
  });
  it("throws on malformed repo", () => {
    expect(() => createGithubClient("not-a-repo")).toThrow(/owner\/repo/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/github-client.test.ts`
Expected: FAIL — cannot find module `../src/github/client.js`.

- [ ] **Step 3: Write `src/github/client.ts`**

```ts
import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";

export interface GithubClient {
  octokit: Octokit;
  owner: string;
  repo: string;
}

function defaultGhTokenReader(): string | undefined {
  try {
    const t = execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

export function resolveToken(o: {
  explicit?: string;
  env?: NodeJS.ProcessEnv;
  ghTokenReader?: () => string | undefined;
} = {}): string | undefined {
  const env = o.env ?? process.env;
  const reader = o.ghTokenReader ?? defaultGhTokenReader;
  if (o.explicit) return o.explicit;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  if (env.GH_TOKEN) return env.GH_TOKEN;
  return reader();
}

export function createGithubClient(repo: string, token?: string): GithubClient {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid repo "${repo}", expected owner/repo`);
  }
  const octokit = new Octokit({ auth: resolveToken({ explicit: token }) });
  return { octokit, owner, repo: name };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/github-client.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/github/client.ts test/github-client.test.ts
git commit -m "feat: GitHub client wrapper with layered token resolution"
```

---

### Task 6: Source registry & query helpers

**Files:**
- Create: `src/sources/query.ts`, `src/sources/signals.ts`, `src/sources/index.ts`
- Test: `test/sources-query.test.ts`

**Interfaces:**
- Consumes: `WeightedKey`, `SearchContext`, `Source` from types; `GithubClient`.
- Produces:
  - `keyTerms(keys: WeightedKey[], max?: number): string`
  - `buildQuery(ctx: SearchContext, typeQualifier: string): string`
  - `securitySignals(title: string): string[]`
  - `class SourceRegistry` with `register(s: Source)`, `select(ids?: string[]): Source[]`, `all(): Source[]`
  - `defaultRegistry(): SourceRegistry` (returns an empty-but-constructed registry for now; sources are registered in later tasks by editing this file).

- [ ] **Step 1: Write the failing test `test/sources-query.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { keyTerms, buildQuery } from "../src/sources/query.js";
import { securitySignals } from "../src/sources/signals.js";
import { SourceRegistry } from "../src/sources/index.js";
import type { SearchContext, WeightedKey, Source } from "../src/types.js";

const keys: WeightedKey[] = [
  { term: "claim", weight: 5, kind: "function" },
  { term: "share price", weight: 4, kind: "invariant" },
  { term: "the", weight: 1, kind: "generic" },
];

describe("keyTerms", () => {
  it("drops generic kinds, quotes multiword terms, joins with OR", () => {
    const q = keyTerms(keys);
    expect(q).toContain("claim");
    expect(q).toContain('"share price"');
    expect(q).not.toContain("the");
    expect(q).toContain(" OR ");
  });
});

describe("buildQuery", () => {
  it("prefixes repo and type qualifier", () => {
    const ctx = { client: { owner: "acme", repo: "vault" }, keys } as unknown as SearchContext;
    expect(buildQuery(ctx, "type:pr")).toMatch(/^repo:acme\/vault type:pr /);
  });
});

describe("securitySignals", () => {
  it("flags security wording", () => {
    expect(securitySignals("Fix reentrancy vuln")).toContain("security-title");
    expect(securitySignals("update docs")).toEqual([]);
  });
});

describe("SourceRegistry", () => {
  const s = (id: string, on: boolean): Source => ({ id, enabledByDefault: on, search: async () => ({ matches: [] }) });
  it("selects defaults when no ids given, explicit ids otherwise", () => {
    const r = new SourceRegistry();
    r.register(s("a", true));
    r.register(s("b", false));
    expect(r.select().map((x) => x.id)).toEqual(["a"]);
    expect(r.select(["b"]).map((x) => x.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sources-query.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write `src/sources/query.ts`**

```ts
import type { SearchContext, WeightedKey } from "../types.js";

export function keyTerms(keys: WeightedKey[], max = 6): string {
  return keys
    .filter((k) => k.kind !== "generic")
    .slice(0, max)
    .map((k) => (k.term.includes(" ") ? `"${k.term}"` : k.term))
    .join(" OR ");
}

export function buildQuery(ctx: SearchContext, typeQualifier: string): string {
  const repo = `repo:${ctx.client.owner}/${ctx.client.repo}`;
  const terms = keyTerms(ctx.keys);
  return `${repo} ${typeQualifier} ${terms}`.trim();
}
```

- [ ] **Step 4: Write `src/sources/signals.ts`**

```ts
const SECURITY_RE = /\b(fix|fixes|fixed|vuln|vulnerability|security|exploit|audit|patch|reentran|overflow|underflow)\b/i;

export function securitySignals(title: string): string[] {
  return SECURITY_RE.test(title) ? ["security-title"] : [];
}
```

- [ ] **Step 5: Write `src/sources/index.ts`**

```ts
import type { Source } from "../types.js";

export class SourceRegistry {
  private sources: Source[] = [];

  register(s: Source): void {
    this.sources.push(s);
  }

  all(): Source[] {
    return [...this.sources];
  }

  select(ids?: string[]): Source[] {
    if (ids && ids.length > 0) {
      return this.sources.filter((s) => ids.includes(s.id));
    }
    return this.sources.filter((s) => s.enabledByDefault);
  }
}

export function defaultRegistry(): SourceRegistry {
  const r = new SourceRegistry();
  // Sources are registered here as they are implemented (Tasks 7–10).
  return r;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/sources-query.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sources/query.ts src/sources/signals.ts src/sources/index.ts test/sources-query.test.ts
git commit -m "feat: source registry, query builder, security signals"
```

---

### Task 7: GitHub PRs & Issues sources

**Files:**
- Create: `src/sources/githubPrs.ts`, `src/sources/githubIssues.ts`
- Modify: `src/sources/index.ts` (register both in `defaultRegistry`)
- Test: `test/github-prs-issues.test.ts`

**Interfaces:**
- Consumes: `Source`, `SearchContext`, `RawMatch`; `buildQuery`; `securitySignals`.
- Produces: `githubPrs: Source` (id `"github-prs"`), `githubIssues: Source` (id `"github-issues"`).

- [ ] **Step 1: Write the failing test `test/github-prs-issues.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { githubPrs } from "../src/sources/githubPrs.js";
import { githubIssues } from "../src/sources/githubIssues.js";
import type { SearchContext } from "../src/types.js";

function ctxWith(items: unknown[]): SearchContext {
  const issuesAndPullRequests = vi.fn().mockResolvedValue({ data: { items } });
  return {
    client: { owner: "acme", repo: "vault", octokit: { rest: { search: { issuesAndPullRequests } } } },
    finding: { title: "Reentrancy in claim", description: "", functions: ["claim"] },
    keys: [{ term: "claim", weight: 5, kind: "function" }],
    log: () => {},
  } as unknown as SearchContext;
}

describe("githubPrs", () => {
  it("maps merged PRs and flags security titles", async () => {
    const ctx = ctxWith([
      { number: 12, html_url: "http://pr/12", title: "Fix reentrancy in claim()", state: "closed", pull_request: { merged_at: "2024-01-01" }, body: "patched" },
    ]);
    const res = await githubPrs.search(ctx);
    expect(res.matches[0].id).toBe("#12");
    expect(res.matches[0].state).toBe("merged");
    expect(res.matches[0].signals).toContain("security-title");
  });

  it("honours dryRun without calling the API", async () => {
    const ctx = ctxWith([]);
    (ctx as unknown as { dryRun: boolean }).dryRun = true;
    const res = await githubPrs.search(ctx);
    expect(res.matches).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.client.octokit as any).rest.search.issuesAndPullRequests).not.toHaveBeenCalled();
  });
});

describe("githubIssues", () => {
  it("maps issue state directly", async () => {
    const ctx = ctxWith([{ number: 3, html_url: "http://i/3", title: "claim double-spend", state: "closed", body: "" }]);
    const res = await githubIssues.search(ctx);
    expect(res.matches[0].state).toBe("closed");
    expect(res.matches[0].sourceId).toBe("github-issues");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/github-prs-issues.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write `src/sources/githubPrs.ts`**

```ts
import type { RawMatch, Source } from "../types.js";
import { buildQuery } from "./query.js";
import { securitySignals } from "./signals.js";

interface SearchItem {
  number: number;
  html_url: string;
  title: string;
  state: string;
  body?: string | null;
  pull_request?: { merged_at?: string | null };
}

export const githubPrs: Source = {
  id: "github-prs",
  enabledByDefault: true,
  async search(ctx) {
    const q = buildQuery(ctx, "type:pr");
    if (ctx.dryRun) {
      ctx.log(`[github-prs] ${q}`);
      return { matches: [] };
    }
    const res = await ctx.client.octokit.rest.search.issuesAndPullRequests({ q, per_page: 30 });
    const matches = (res.data.items as SearchItem[]).map((it): RawMatch => ({
      sourceId: "github-prs",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.pull_request?.merged_at ? "merged" : it.state,
      snippet: (it.body ?? "").slice(0, 300),
      signals: securitySignals(it.title),
    }));
    return { matches };
  },
};
```

- [ ] **Step 4: Write `src/sources/githubIssues.ts`**

```ts
import type { RawMatch, Source } from "../types.js";
import { buildQuery } from "./query.js";
import { securitySignals } from "./signals.js";

interface SearchItem {
  number: number;
  html_url: string;
  title: string;
  state: string;
  body?: string | null;
}

export const githubIssues: Source = {
  id: "github-issues",
  enabledByDefault: true,
  async search(ctx) {
    const q = buildQuery(ctx, "type:issue");
    if (ctx.dryRun) {
      ctx.log(`[github-issues] ${q}`);
      return { matches: [] };
    }
    const res = await ctx.client.octokit.rest.search.issuesAndPullRequests({ q, per_page: 30 });
    const matches = (res.data.items as SearchItem[]).map((it): RawMatch => ({
      sourceId: "github-issues",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.state,
      snippet: (it.body ?? "").slice(0, 300),
      signals: securitySignals(it.title),
    }));
    return { matches };
  },
};
```

- [ ] **Step 5: Register both in `src/sources/index.ts`**

Replace the body of `defaultRegistry` with:
```ts
export function defaultRegistry(): SourceRegistry {
  const r = new SourceRegistry();
  r.register(githubPrs);
  r.register(githubIssues);
  return r;
}
```
And add at the top of `src/sources/index.ts`, below the existing import:
```ts
import { githubPrs } from "./githubPrs.js";
import { githubIssues } from "./githubIssues.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/github-prs-issues.test.ts test/sources-query.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sources/githubPrs.ts src/sources/githubIssues.ts src/sources/index.ts test/github-prs-issues.test.ts
git commit -m "feat: github PR and issue prior-art sources"
```

---

### Task 8: GitHub commits (+ silent-fix), releases, code sources

**Files:**
- Create: `src/sources/githubCommits.ts`, `src/sources/githubReleases.ts`, `src/sources/githubCode.ts`
- Modify: `src/sources/index.ts` (register all three)
- Test: `test/github-commits.test.ts`, `test/github-releases-code.test.ts`

**Interfaces:**
- Consumes: `Source`, `SearchContext`, `RawMatch`; `buildQuery`, `keyTerms`; `securitySignals`.
- Produces: `githubCommits: Source` (id `"github-commits"`), `githubReleases: Source` (id `"github-releases"`), `githubCode: Source` (id `"github-code"`).

- [ ] **Step 1: Write the failing test `test/github-commits.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { githubCommits } from "../src/sources/githubCommits.js";
import type { SearchContext } from "../src/types.js";

function ctx(opts: {
  commitItems?: unknown[];
  compareFiles?: unknown[];
  scopeTag?: string;
  file?: string;
}): SearchContext {
  const commits = vi.fn().mockResolvedValue({ data: { items: opts.commitItems ?? [] } });
  const compareCommitsWithBasehead = vi.fn().mockResolvedValue({ data: { files: opts.compareFiles ?? [] } });
  return {
    client: {
      owner: "acme", repo: "vault",
      octokit: { rest: { search: { commits }, repos: { compareCommitsWithBasehead } } },
    },
    finding: { title: "Rounding in settle", description: "", functions: ["settle"], file: opts.file, scopeTag: opts.scopeTag },
    keys: [{ term: "settle", weight: 5, kind: "function" }],
    log: () => {},
  } as unknown as SearchContext;
}

describe("githubCommits", () => {
  it("maps commit search results", async () => {
    const c = ctx({ commitItems: [{ sha: "abc1234", html_url: "http://c/abc", commit: { message: "fix settle rounding" } }] });
    const res = await githubCommits.search(c);
    expect(res.matches[0].id).toBe("abc1234");
    expect(res.matches[0].title).toContain("settle");
  });

  it("emits a silent-fix match when scopeTag..HEAD touches the affected file", async () => {
    const c = ctx({
      scopeTag: "v1.0.0", file: "src/Vault.sol",
      compareFiles: [{ filename: "src/Vault.sol", status: "modified", patch: "- old\n+ new" }],
    });
    const res = await githubCommits.search(c);
    const silent = res.matches.find((m) => m.signals?.includes("silent-fix"));
    expect(silent).toBeDefined();
    expect(silent?.filePath).toBe("src/Vault.sol");
  });

  it("skips silent-fix detection when scopeTag or file is absent", async () => {
    const c = ctx({ commitItems: [] });
    const res = await githubCommits.search(c);
    expect(res.matches.some((m) => m.signals?.includes("silent-fix"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/github-commits.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/sources/githubCommits.ts`**

```ts
import type { RawMatch, Source } from "../types.js";
import { keyTerms } from "./query.js";

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
        ctx.log(`[github-commits] compare: ${ctx.finding.scopeTag}...HEAD path=${ctx.finding.file}`);
      }
      return { matches: [] };
    }

    const res = await ctx.client.octokit.rest.search.commits({ q, per_page: 20 });
    for (const it of res.data.items as CommitItem[]) {
      matches.push({
        sourceId: "github-commits",
        id: it.sha.slice(0, 7),
        url: it.html_url,
        title: it.commit.message.split("\n")[0],
        snippet: it.commit.message.slice(0, 300),
      });
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
          snippet: (hit.patch ?? "").slice(0, 300),
          signals: ["silent-fix"],
        });
      }
    }

    return { matches };
  },
};
```

- [ ] **Step 4: Run commits tests**

Run: `npx vitest run test/github-commits.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test `test/github-releases-code.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { githubReleases } from "../src/sources/githubReleases.js";
import { githubCode } from "../src/sources/githubCode.js";
import type { SearchContext } from "../src/types.js";

const keys = [{ term: "settle", weight: 5, kind: "function" as const }];

describe("githubReleases", () => {
  it("keeps only releases whose name/body mentions a key term", async () => {
    const listReleases = vi.fn().mockResolvedValue({
      data: [
        { name: "v1.1.0", tag_name: "v1.1.0", html_url: "http://r/1", body: "fix settle rounding" },
        { name: "v1.0.0", tag_name: "v1.0.0", html_url: "http://r/0", body: "initial release" },
      ],
    });
    const ctx = {
      client: { owner: "acme", repo: "vault", octokit: { rest: { repos: { listReleases } } } },
      finding: { title: "settle", description: "" }, keys, log: () => {},
    } as unknown as SearchContext;
    const res = await githubReleases.search(ctx);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].id).toBe("v1.1.0");
  });
});

describe("githubCode", () => {
  it("maps code results to matches with filePath", async () => {
    const code = vi.fn().mockResolvedValue({
      data: { items: [{ path: "src/Vault.sol", html_url: "http://code/1", repository: { full_name: "acme/vault" } }] },
    });
    const ctx = {
      client: { owner: "acme", repo: "vault", octokit: { rest: { search: { code } } } },
      finding: { title: "settle", description: "" }, keys, log: () => {},
    } as unknown as SearchContext;
    const res = await githubCode.search(ctx);
    expect(res.matches[0].filePath).toBe("src/Vault.sol");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run test/github-releases-code.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 7: Write `src/sources/githubReleases.ts`**

```ts
import type { RawMatch, Source } from "../types.js";

interface Release {
  name: string | null;
  tag_name: string;
  html_url: string;
  body?: string | null;
}

export const githubReleases: Source = {
  id: "github-releases",
  enabledByDefault: true,
  async search(ctx) {
    if (ctx.dryRun) {
      ctx.log(`[github-releases] list releases for ${ctx.client.owner}/${ctx.client.repo}`);
      return { matches: [] };
    }
    const res = await ctx.client.octokit.rest.repos.listReleases({
      owner: ctx.client.owner,
      repo: ctx.client.repo,
      per_page: 50,
    });
    const terms = ctx.keys.filter((k) => k.kind !== "generic").map((k) => k.term.toLowerCase());
    const matches: RawMatch[] = [];
    for (const rel of res.data as Release[]) {
      const hay = `${rel.name ?? ""} ${rel.body ?? ""}`.toLowerCase();
      if (terms.some((t) => hay.includes(t))) {
        matches.push({
          sourceId: "github-releases",
          id: rel.tag_name,
          url: rel.html_url,
          title: rel.name ?? rel.tag_name,
          snippet: (rel.body ?? "").slice(0, 300),
        });
      }
    }
    return { matches };
  },
};
```

- [ ] **Step 8: Write `src/sources/githubCode.ts`**

```ts
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
```

- [ ] **Step 9: Register the three new sources in `src/sources/index.ts`**

Add imports below the existing source imports:
```ts
import { githubCommits } from "./githubCommits.js";
import { githubReleases } from "./githubReleases.js";
import { githubCode } from "./githubCode.js";
```
And in `defaultRegistry`, after the existing `r.register(...)` lines add:
```ts
  r.register(githubCommits);
  r.register(githubReleases);
  r.register(githubCode);
```

- [ ] **Step 10: Run all source tests**

Run: `npx vitest run test/github-commits.test.ts test/github-releases-code.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/sources/githubCommits.ts src/sources/githubReleases.ts src/sources/githubCode.ts src/sources/index.ts test/github-commits.test.ts test/github-releases-code.test.ts
git commit -m "feat: commit (silent-fix), release, and code prior-art sources"
```

---

### Task 9: Web3 audit-reports source

**Files:**
- Create: `src/sources/web3/auditReports.ts`
- Modify: `src/sources/index.ts` (register)
- Test: `test/web3-audit-reports.test.ts`

**Interfaces:**
- Consumes: `Source`, `SearchContext`, `RawMatch`.
- Produces: `auditReports: Source` (id `"audit-reports"`). Scans candidate audit directories via `repos.getContent`, full-text-searches markdown/text files for key terms, sets `signals: ["audit-ack"]` when acknowledgement language appears near a key hit, and adds `notes` for PDF/binary reports that need manual review.

- [ ] **Step 1: Write the failing test `test/web3-audit-reports.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { auditReports } from "../src/sources/web3/auditReports.js";
import type { SearchContext } from "../src/types.js";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function ctxWith(getContent: ReturnType<typeof vi.fn>): SearchContext {
  return {
    client: { owner: "acme", repo: "vault", octokit: { rest: { repos: { getContent } } } },
    finding: { title: "Rounding in settle", description: "", functions: ["settle"] },
    keys: [{ term: "settle", weight: 5, kind: "function" }],
    log: () => {},
  } as unknown as SearchContext;
}

describe("auditReports", () => {
  it("flags audit-ack when a markdown report acknowledges a key hit", async () => {
    const getContent = vi.fn()
      // first call: list the "audits" directory
      .mockResolvedValueOnce({ data: [{ type: "file", name: "oz.md", path: "audits/oz.md", download_url: "u", html_url: "http://audits/oz.md" }] })
      // second call: fetch the file content
      .mockResolvedValueOnce({ data: { type: "file", content: b64("The settle rounding issue is acknowledged and won't fix."), encoding: "base64" } });
    const res = await auditReports.search(ctxWith(getContent));
    expect(res.matches[0].signals).toContain("audit-ack");
    expect(res.matches[0].url).toBe("http://audits/oz.md");
  });

  it("adds a note for pdf reports and returns no throw when dirs are missing", async () => {
    const getContent = vi.fn()
      .mockResolvedValueOnce({ data: [{ type: "file", name: "report.pdf", path: "audits/report.pdf", html_url: "http://audits/report.pdf" }] })
      .mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    const res = await auditReports.search(ctxWith(getContent));
    expect(res.matches).toEqual([]);
    expect(res.notes?.some((n) => n.includes("report.pdf"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web3-audit-reports.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/sources/web3/auditReports.ts`**

```ts
import type { RawMatch, Source } from "../../types.js";

const CANDIDATE_DIRS = ["audits", "audit", "docs/audits", "security"];
const TEXT_EXT = /\.(md|markdown|txt)$/i;
const PDF_EXT = /\.pdf$/i;
const ACK_RE = /\b(acknowledged|known issue|won'?t fix|wontfix|by design|out of scope|accepted risk)\b/i;

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
          const text = Buffer.from(data.content, (data.encoding as BufferEncoding) ?? "base64").toString("utf8");
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
```

- [ ] **Step 4: Register in `src/sources/index.ts`**

Add import:
```ts
import { auditReports } from "./web3/auditReports.js";
```
And in `defaultRegistry` add:
```ts
  r.register(auditReports);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/web3-audit-reports.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sources/web3/auditReports.ts src/sources/index.ts test/web3-audit-reports.test.ts
git commit -m "feat: web3 audit-report source with acknowledgement detection"
```

---

### Task 10: Web3 contests source (guided)

**Files:**
- Create: `src/sources/web3/contests.ts`
- Modify: `src/sources/index.ts` (register)
- Test: `test/web3-contests.test.ts`

**Interfaces:**
- Consumes: `Source`, `SearchContext`, `RawMatch`, `FetchFn`.
- Produces:
  - `contestUrls(repo: string, terms: string[]): string[]` (pure).
  - `contests: Source` (id `"contests"`). In guided mode returns candidate URLs as `notes`. If `ctx.fetch` is provided, fetches each URL and emits a `RawMatch` with `signals: ["contest"]` when a key term appears in the body.

- [ ] **Step 1: Write the failing test `test/web3-contests.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { contestUrls, contests } from "../src/sources/web3/contests.js";
import type { SearchContext } from "../src/types.js";

describe("contestUrls", () => {
  it("builds search URLs for the major platforms", () => {
    const urls = contestUrls("vault", ["settle"]);
    expect(urls.some((u) => u.includes("code4rena"))).toBe(true);
    expect(urls.some((u) => u.includes("sherlock"))).toBe(true);
    expect(urls.some((u) => u.includes("settle"))).toBe(true);
  });
});

const base = {
  client: { owner: "acme", repo: "vault" },
  finding: { title: "settle rounding", description: "" },
  keys: [{ term: "settle", weight: 5, kind: "function" as const }],
  log: () => {},
};

describe("contests source", () => {
  it("returns candidate URLs as notes in guided mode (no fetch)", async () => {
    const res = await contests.search(base as unknown as SearchContext);
    expect(res.matches).toEqual([]);
    expect(res.notes && res.notes.length).toBeGreaterThan(0);
  });

  it("emits a contest match when fetch reveals a key term", async () => {
    const fetch = vi.fn().mockResolvedValue("... the settle function rounds down ...");
    const ctx = { ...base, fetch } as unknown as SearchContext;
    const res = await contests.search(ctx);
    expect(res.matches.some((m) => m.signals?.includes("contest"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web3-contests.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/sources/web3/contests.ts`**

```ts
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
```

- [ ] **Step 4: Register in `src/sources/index.ts`**

Add import:
```ts
import { contests } from "./web3/contests.js";
```
And in `defaultRegistry` add:
```ts
  r.register(contests);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/web3-contests.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sources/web3/contests.ts src/sources/index.ts test/web3-contests.test.ts
git commit -m "feat: guided web3 contest source with optional fetch scan"
```

---

### Task 11: Reporters

**Files:**
- Create: `src/reporters/json.ts`, `src/reporters/markdown.ts`, `src/reporters/terminal.ts`
- Test: `test/reporters.test.ts`

**Interfaces:**
- Consumes: `Verdict`, `Match`.
- Produces: `renderJson(v: Verdict): string`, `renderMarkdown(v: Verdict): string`, `renderTerminal(v: Verdict): string`.

- [ ] **Step 1: Write the failing test `test/reporters.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderJson, renderMarkdown, renderTerminal } from "../src/reporters/index.js";
import type { Verdict } from "../src/types.js";

const verdict: Verdict = {
  label: "DUPLICATE",
  confidence: 0.82,
  matches: [
    { sourceId: "github-prs", id: "#12", url: "http://pr/12", title: "Fix reentrancy in claim()", state: "merged", matchedKeys: ["claim"], score: 88 },
  ],
  notes: ["Manual check (contest platform): http://c4"],
};

describe("reporters", () => {
  it("json round-trips", () => {
    expect(JSON.parse(renderJson(verdict)).label).toBe("DUPLICATE");
  });
  it("markdown has a heading, verdict, and evidence row", () => {
    const md = renderMarkdown(verdict);
    expect(md).toContain("## Duplicate check");
    expect(md).toContain("DUPLICATE");
    expect(md).toContain("#12");
    expect(md).toContain("http://c4");
  });
  it("terminal shows label, confidence, and top match", () => {
    const out = renderTerminal(verdict);
    expect(out).toContain("DUPLICATE");
    expect(out).toContain("82%");
    expect(out).toContain("#12");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reporters.test.ts`
Expected: FAIL — cannot find module `../src/reporters/index.js`.

- [ ] **Step 3: Write the three reporters and a barrel `src/reporters/index.ts`**

`src/reporters/json.ts`:
```ts
import type { Verdict } from "../types.js";

export function renderJson(v: Verdict): string {
  return JSON.stringify(v, null, 2);
}
```

`src/reporters/markdown.ts`:
```ts
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
      lines.push(`| ${m.score} | ${m.sourceId} | [${m.id}](${m.url}) | ${m.state ?? "-"} | ${m.title.replace(/\|/g, "\\|")} |`);
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
```

`src/reporters/terminal.ts`:
```ts
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
```

`src/reporters/index.ts`:
```ts
export { renderJson } from "./json.js";
export { renderMarkdown } from "./markdown.js";
export { renderTerminal } from "./terminal.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/reporters.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/reporters test/reporters.test.ts
git commit -m "feat: terminal, json, and markdown reporters"
```

---

### Task 12: Engine orchestration

**Files:**
- Create: `src/engine.ts`
- Modify: `src/index.ts` (export `run` + public types)
- Test: `test/engine.test.ts`

**Interfaces:**
- Consumes: `createGithubClient`, `extractKeys`, `defaultRegistry`, `scoreMatch`, `aggregate`, `THRESHOLDS`; types `Finding`, `Verdict`, `Source`, `SourceResult`, `FetchFn`.
- Produces:
  - `interface RunOptions { repo: string; finding: Finding; sources?: string[]; token?: string; minScore?: number; dryRun?: boolean; fetch?: FetchFn; log?: (m: string) => void; registry?: SourceRegistry; }`
  - `run(opts: RunOptions): Promise<Verdict>`

  (`registry` is an optional injection point so tests can supply fake sources without network.)

- [ ] **Step 1: Write the failing test `test/engine.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { run } from "../src/engine.js";
import { SourceRegistry } from "../src/sources/index.js";
import type { Source } from "../src/types.js";

const fakePrSource: Source = {
  id: "github-prs",
  enabledByDefault: true,
  async search() {
    return {
      matches: [
        { sourceId: "github-prs", id: "#12", url: "http://pr/12", title: "Fix reentrancy in claim()", state: "merged", signals: ["security-title"] },
      ],
    };
  },
};

const noteSource: Source = {
  id: "contests",
  enabledByDefault: true,
  async search() {
    return { matches: [], notes: ["Manual check: http://c4"] };
  },
};

describe("run", () => {
  it("scores matches, aggregates a verdict, and collects notes", async () => {
    const registry = new SourceRegistry();
    registry.register(fakePrSource);
    registry.register(noteSource);
    const verdict = await run({
      repo: "acme/vault",
      finding: { title: "Reentrancy in claim", description: "", functions: ["claim"], file: "src/Vault.sol" },
      token: "x",
      registry,
    });
    expect(verdict.label).toBe("DUPLICATE");
    expect(verdict.matches[0].id).toBe("#12");
    expect(verdict.notes).toContain("Manual check: http://c4");
  });

  it("does not crash if a source throws (isolated failure)", async () => {
    const bad: Source = { id: "github-issues", enabledByDefault: true, async search() { throw new Error("boom"); } };
    const registry = new SourceRegistry();
    registry.register(bad);
    const verdict = await run({
      repo: "acme/vault",
      finding: { title: "x", description: "" },
      token: "x",
      registry,
    });
    expect(verdict.label).toBe("NOVEL");
    expect(verdict.notes.some((n) => n.includes("github-issues"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — cannot find module `../src/engine.js`.

- [ ] **Step 3: Write `src/engine.ts`**

```ts
import { createGithubClient } from "./github/client.js";
import { extractKeys } from "./keys.js";
import { scoreMatch, aggregate, THRESHOLDS } from "./score.js";
import { defaultRegistry, SourceRegistry } from "./sources/index.js";
import type { Finding, FetchFn, Match, SearchContext, Source, SourceResult, Verdict } from "./types.js";

export interface RunOptions {
  repo: string;
  finding: Finding;
  sources?: string[];
  token?: string;
  minScore?: number;
  dryRun?: boolean;
  fetch?: FetchFn;
  log?: (m: string) => void;
  registry?: SourceRegistry;
}

async function safeSearch(source: Source, ctx: SearchContext): Promise<SourceResult & { failedId?: string }> {
  try {
    return await source.search(ctx);
  } catch (err) {
    ctx.log(`[${source.id}] failed: ${(err as Error).message}`);
    return { matches: [], notes: [`Source ${source.id} failed: ${(err as Error).message}`], failedId: source.id };
  }
}

export async function run(opts: RunOptions): Promise<Verdict> {
  const client = createGithubClient(opts.repo, opts.token);
  const keys = extractKeys(opts.finding);
  const registry = opts.registry ?? defaultRegistry();
  const sources = registry.select(opts.sources);
  const log = opts.log ?? ((): void => {});

  const ctx: SearchContext = {
    client,
    finding: opts.finding,
    keys,
    dryRun: opts.dryRun,
    fetch: opts.fetch,
    log,
  };

  const results = await Promise.all(sources.map((s) => safeSearch(s, ctx)));
  const rawMatches = results.flatMap((r) => r.matches);
  const notes = results.flatMap((r) => r.notes ?? []);

  const minScore = opts.minScore ?? THRESHOLDS.report;
  const scored: Match[] = rawMatches
    .map((r) => scoreMatch(r, keys, opts.finding))
    .filter((m) => m.score >= minScore);

  const verdict = aggregate(scored, opts.finding);
  verdict.notes = [...verdict.notes, ...notes];
  return verdict;
}
```

- [ ] **Step 4: Update `src/index.ts` to export the public API**

```ts
export const VERSION = "0.1.0";
export { run } from "./engine.js";
export type { RunOptions } from "./engine.js";
export type { Finding, Match, Verdict, Source } from "./types.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/engine.test.ts test/smoke.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine.ts src/index.ts test/engine.test.ts
git commit -m "feat: engine orchestration with isolated source failures"
```

---

### Task 13: CLI

**Files:**
- Create/overwrite: `src/cli.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `run` (via `runCli` calling engine), `loadFindingFromFile`, reporters, types.
- Produces:
  - `buildFindingFromOptions(opts): Finding` (inline flags → Finding)
  - `verdictRank(label: VerdictLabel): number`
  - `runCli(argv: string[], deps?: { run?: typeof run; write?: (s: string) => void; exit?: (code: number) => void }): Promise<void>`
  - A `commander` program invoked when the module is run as the CLI entry.

- [ ] **Step 1: Write the failing test `test/cli.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { buildFindingFromOptions, verdictRank, runCli } from "../src/cli.js";
import type { Verdict } from "../src/types.js";

describe("buildFindingFromOptions", () => {
  it("splits comma lists for functions and keys", () => {
    const f = buildFindingFromOptions({ title: "t", desc: "d", function: ["a", "b"], keys: "x,y", file: "src/V.sol" });
    expect(f.functions).toEqual(["a", "b"]);
    expect(f.keys).toEqual(["x", "y"]);
    expect(f.file).toBe("src/V.sol");
  });
});

describe("verdictRank", () => {
  it("orders NOVEL lowest and DUPLICATE highest", () => {
    expect(verdictRank("NOVEL")).toBeLessThan(verdictRank("PARTIAL-OVERLAP"));
    expect(verdictRank("DUPLICATE")).toBeGreaterThan(verdictRank("KNOWN-ISSUE") - 100);
    expect(verdictRank("DUPLICATE")).toBe(4);
  });
});

describe("runCli", () => {
  const verdict: Verdict = { label: "DUPLICATE", confidence: 0.9, matches: [], notes: [] };
  it("prints markdown and exits non-zero when --fail-on is met", async () => {
    const write = vi.fn();
    const exit = vi.fn();
    const run = vi.fn().mockResolvedValue(verdict);
    await runCli(
      ["node", "dup-scout", "acme/vault", "--title", "t", "--desc", "d", "--markdown", "--fail-on", "PARTIAL-OVERLAP"],
      { run, write, exit },
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining("## Duplicate check"));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not exit non-zero when verdict is below --fail-on", async () => {
    const write = vi.fn();
    const exit = vi.fn();
    const run = vi.fn().mockResolvedValue({ ...verdict, label: "NOVEL" });
    await runCli(["node", "dup-scout", "acme/vault", "--title", "t", "--desc", "d", "--fail-on", "DUPLICATE"], { run, write, exit });
    expect(exit).not.toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — cannot find module `../src/cli.js`.

- [ ] **Step 3: Write `src/cli.ts`**

```ts
import { Command } from "commander";
import { run as engineRun } from "./engine.js";
import { loadFindingFromFile } from "./finding.js";
import { renderJson, renderMarkdown, renderTerminal } from "./reporters/index.js";
import type { Finding, VerdictLabel } from "./types.js";

export interface CliOptions {
  title?: string;
  desc?: string;
  finding?: string;
  file?: string;
  function?: string[];
  keys?: string;
  scopeTag?: string;
  bugClass?: string;
  sources?: string;
  json?: boolean;
  markdown?: boolean;
  token?: string;
  minScore?: string;
  dryRun?: boolean;
  failOn?: string;
}

export interface CliDeps {
  run?: typeof engineRun;
  write?: (s: string) => void;
  exit?: (code: number) => void;
}

const RANK: Record<VerdictLabel, number> = {
  NOVEL: 0,
  "PARTIAL-OVERLAP": 1,
  "SILENTLY-FIXED": 2,
  "KNOWN-ISSUE": 3,
  DUPLICATE: 4,
};

export function verdictRank(label: VerdictLabel): number {
  return RANK[label];
}

export function buildFindingFromOptions(opts: CliOptions): Finding {
  if (!opts.title) throw new Error("Provide --title (or use --finding <file>)");
  const csv = (v?: string): string[] | undefined =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  return {
    title: opts.title,
    description: opts.desc ?? "",
    file: opts.file,
    functions: opts.function,
    keys: csv(opts.keys),
    scopeTag: opts.scopeTag,
    bugClass: opts.bugClass,
  };
}

async function runCheck(
  repo: string,
  opts: CliOptions,
  deps: Required<CliDeps>,
): Promise<void> {
  const finding = opts.finding ? loadFindingFromFile(opts.finding) : buildFindingFromOptions(opts);
  const verdict = await deps.run({
    repo,
    finding,
    sources: opts.sources ? opts.sources.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    token: opts.token,
    minScore: opts.minScore ? Number(opts.minScore) : undefined,
    dryRun: opts.dryRun,
    log: (m) => process.stderr.write(m + "\n"),
  });

  if (opts.json) deps.write(renderJson(verdict));
  else if (opts.markdown) deps.write(renderMarkdown(verdict));
  else deps.write(renderTerminal(verdict));

  if (opts.failOn) {
    const threshold = opts.failOn.toUpperCase() as VerdictLabel;
    if (RANK[threshold] !== undefined && verdictRank(verdict.label) >= RANK[threshold]) {
      deps.exit(1);
    }
  }
}

export function buildProgram(deps: CliDeps = {}): Command {
  const filled: Required<CliDeps> = {
    run: deps.run ?? engineRun,
    write: deps.write ?? ((s: string): void => process.stdout.write(s + "\n")),
    exit: deps.exit ?? ((code: number): void => process.exit(code)),
  };

  const program = new Command();
  program.name("dup-scout").description("Prior-art / duplicate checker for bug bounty findings");

  program
    .command("check", { isDefault: true })
    .description("check whether a finding is a likely duplicate")
    .argument("<owner/repo>", "target GitHub repository")
    .option("--title <s>", "finding title")
    .option("--desc <s>", "finding description")
    .option("--finding <file>", "load finding from a .json or .md file")
    .option("--file <path>", "affected source file")
    .option("--function <name...>", "affected function name(s)")
    .option("--keys <a,b,c>", "extra search keys (comma-separated)")
    .option("--scope-tag <tag>", "in-scope tag for silent-fix detection")
    .option("--bug-class <s>", "bug class (e.g. reentrancy)")
    .option("--sources <ids>", "comma-separated source ids to enable")
    .option("--json", "output JSON")
    .option("--markdown", "output a markdown 'Duplicate check' block")
    .option("--token <t>", "GitHub token override")
    .option("--min-score <n>", "minimum score to report")
    .option("--dry-run", "print queries without calling the API")
    .option("--fail-on <label>", "exit non-zero at/above this verdict")
    .action(async (repo: string, opts: CliOptions) => {
      await runCheck(repo, opts, filled);
    });

  // NOTE: Task 14 adds a `program.command("install")` here.
  return program;
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<void> {
  await buildProgram(deps).parseAsync(argv);
}

// Entry point when run as the CLI binary.
const invokedDirectly =
  typeof process.argv[1] === "string" && /dup-scout|cli\.(js|ts)$/.test(process.argv[1]);
if (invokedDirectly) {
  runCli(process.argv).catch((err) => {
    process.stderr.write(`dup-scout: ${(err as Error).message}\n`);
    process.exit(2);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full suite + build + lint**

Run: `npm test`
Expected: all suites pass.
Run: `npm run build`
Expected: `dist/cli.js` and `dist/index.js` emitted with the `#!/usr/bin/env node` banner on `cli.js`.
Run: `npm run lint`
Expected: no errors. Fix any lint/format issues, then re-run.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: commander CLI with output formats and CI exit codes"
```

---

### Task 14: `install` subcommand & agent integration

**Files:**
- Create: `src/install.ts`
- Modify: `src/cli.ts` (add the `install` subcommand to `buildProgram`; extend `CliDeps`)
- Test: `test/install.test.ts`, and add an install case to `test/cli.test.ts`

**Interfaces:**
- Consumes: node `fs`/`os`/`path`.
- Produces:
  - Templates `CLAUDE_COMMAND_TEMPLATE`, `CODEX_PROMPT_TEMPLATE`.
  - `claudeCommandDir(env?, home?): string`, `codexPromptDir(env?, home?): string`
  - `resolveAgents(opts): { claude: boolean; codex: boolean }`
  - `planInstall(opts): InstallTarget[]`
  - `performInstall(targets, force, fs?): InstallResult[]`
  - `hasOnPath(bin, env?): boolean`
  - `installCommand(opts, deps?): { results: InstallResult[]; warnings: string[] }`
  - Types `InstallTarget`, `InstallResult`, `InstallFs`.
- CLI wiring adds `installFs?: InstallFs` to `CliDeps` (test injection point).

- [ ] **Step 1: Write the failing test `test/install.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import {
  planInstall, performInstall, resolveAgents,
  claudeCommandDir, codexPromptDir, CLAUDE_COMMAND_TEMPLATE,
} from "../src/install.js";

describe("resolveAgents", () => {
  it("defaults to both, honours --all and single flags", () => {
    expect(resolveAgents({})).toEqual({ claude: true, codex: true });
    expect(resolveAgents({ all: true })).toEqual({ claude: true, codex: true });
    expect(resolveAgents({ claude: true })).toEqual({ claude: true, codex: false });
    expect(resolveAgents({ codex: true })).toEqual({ claude: false, codex: true });
  });
});

describe("dir resolution", () => {
  it("honours CLAUDE_CONFIG_DIR and CODEX_HOME, else falls back to home", () => {
    expect(claudeCommandDir({ CLAUDE_CONFIG_DIR: "/x/.claude" }, "/home")).toBe(path.join("/x/.claude", "commands"));
    expect(codexPromptDir({ CODEX_HOME: "/y/.codex" }, "/home")).toBe(path.join("/y/.codex", "prompts"));
    expect(claudeCommandDir({}, "/home")).toBe(path.join("/home", ".claude", "commands"));
    expect(codexPromptDir({}, "/home")).toBe(path.join("/home", ".codex", "prompts"));
  });
});

describe("planInstall", () => {
  it("builds targets with correct files and templates", () => {
    const t = planInstall({ claude: true, codex: true, env: {}, home: "/home" });
    expect(t.map((x) => x.name)).toEqual(["claude", "codex"]);
    expect(t[0].file).toBe(path.join("/home", ".claude", "commands", "dup-scout.md"));
    expect(t[0].content).toBe(CLAUDE_COMMAND_TEMPLATE);
  });
});

describe("performInstall", () => {
  function fsMock(existing: string[]) {
    const written: Record<string, string> = {};
    return {
      written,
      fs: { exists: (p: string) => existing.includes(p), mkdir: vi.fn(), write: (p: string, d: string) => { written[p] = d; } },
    };
  }
  it("writes new files and skips existing without force", () => {
    const targets = planInstall({ claude: true, codex: true, env: {}, home: "/home" });
    const { fs, written } = fsMock([targets[0].file]);
    const res = performInstall(targets, false, fs);
    expect(res[0].status).toBe("skipped");
    expect(res[1].status).toBe("written");
    expect(Object.keys(written)).toEqual([targets[1].file]);
  });
  it("overwrites with force", () => {
    const targets = planInstall({ claude: true, codex: false, env: {}, home: "/home" });
    const { fs, written } = fsMock([targets[0].file]);
    const res = performInstall(targets, true, fs);
    expect(res[0].status).toBe("written");
    expect(written[targets[0].file]).toContain("dup-scout");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/install.test.ts`
Expected: FAIL — cannot find module `../src/install.js`.

- [ ] **Step 3: Write `src/install.ts`**

```ts
import { homedir } from "node:os";
import path, { delimiter } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

export const CLAUDE_COMMAND_TEMPLATE = `---
description: Check whether a finding is a likely duplicate/known-issue with dup-scout
argument-hint: <owner/repo> "<finding title>" [more context]
allowed-tools: Bash(dup-scout:*)
---

You are helping decide whether a bug bounty finding would be marked a duplicate
before it is submitted. Use the \`dup-scout\` CLI (already on PATH).

Finding context from the user: $ARGUMENTS

Steps:
1. Determine the target GitHub repo (owner/repo) and a short finding title,
   description, and — if known — the affected file, function(s), and in-scope tag.
2. Run the checker, for example:
   \`dup-scout <owner/repo> --title "<title>" --desc "<desc>" --file <path> --function <name> --markdown\`
3. Read the verdict (DUPLICATE / KNOWN-ISSUE / SILENTLY-FIXED / PARTIAL-OVERLAP /
   NOVEL) and the evidence table. State whether it is safe to submit, cite the
   strongest matching PR/issue/commit/audit link, and list any manual checks it printed.
`;

export const CODEX_PROMPT_TEMPLATE = `Check whether a bug bounty finding is a likely duplicate before submitting, using the \`dup-scout\` CLI (already on PATH).

Finding context from the user: $ARGUMENTS

Steps:
1. Determine the target GitHub repo (owner/repo), a short finding title and
   description, and — if known — the affected file, function(s), and in-scope tag.
2. Run: dup-scout <owner/repo> --title "<title>" --desc "<desc>" --file <path> --function <name> --markdown
3. Read the verdict (DUPLICATE / KNOWN-ISSUE / SILENTLY-FIXED / PARTIAL-OVERLAP /
   NOVEL) and evidence table. Say whether it is safe to submit, cite the strongest
   matching link, and list any manual checks printed.
`;

export interface InstallTarget {
  name: "claude" | "codex";
  dir: string;
  file: string;
  content: string;
}

export interface InstallResult {
  name: string;
  file: string;
  status: "written" | "skipped";
}

export interface InstallFs {
  exists: (p: string) => boolean;
  mkdir: (p: string) => void;
  write: (p: string, data: string) => void;
}

const realFs: InstallFs = {
  exists: existsSync,
  mkdir: (p) => mkdirSync(p, { recursive: true }),
  write: (p, data) => writeFileSync(p, data, "utf8"),
};

export function claudeCommandDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return path.join(env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"), "commands");
}

export function codexPromptDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return path.join(env.CODEX_HOME ?? path.join(home, ".codex"), "prompts");
}

export function resolveAgents(opts: { claude?: boolean; codex?: boolean; all?: boolean }): {
  claude: boolean;
  codex: boolean;
} {
  if (opts.all || (!opts.claude && !opts.codex)) return { claude: true, codex: true };
  return { claude: !!opts.claude, codex: !!opts.codex };
}

export function planInstall(opts: {
  claude: boolean;
  codex: boolean;
  env?: NodeJS.ProcessEnv;
  home?: string;
}): InstallTarget[] {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const targets: InstallTarget[] = [];
  if (opts.claude) {
    const dir = claudeCommandDir(env, home);
    targets.push({ name: "claude", dir, file: path.join(dir, "dup-scout.md"), content: CLAUDE_COMMAND_TEMPLATE });
  }
  if (opts.codex) {
    const dir = codexPromptDir(env, home);
    targets.push({ name: "codex", dir, file: path.join(dir, "dup-scout.md"), content: CODEX_PROMPT_TEMPLATE });
  }
  return targets;
}

export function performInstall(targets: InstallTarget[], force: boolean, fs: InstallFs = realFs): InstallResult[] {
  return targets.map((t) => {
    if (fs.exists(t.file) && !force) {
      return { name: t.name, file: t.file, status: "skipped" };
    }
    fs.mkdir(t.dir);
    fs.write(t.file, t.content);
    return { name: t.name, file: t.file, status: "written" };
  });
}

export function hasOnPath(bin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".cmd", ".exe", ".ps1", ""] : [""];
  return dirs.some((d) => exts.some((e) => existsSync(path.join(d, bin + e))));
}

export function installCommand(
  opts: { claude?: boolean; codex?: boolean; all?: boolean; force?: boolean },
  deps: { fs?: InstallFs; env?: NodeJS.ProcessEnv; home?: string; pathHasBin?: () => boolean } = {},
): { results: InstallResult[]; warnings: string[] } {
  const agents = resolveAgents(opts);
  const targets = planInstall({ claude: agents.claude, codex: agents.codex, env: deps.env, home: deps.home });
  const results = performInstall(targets, !!opts.force, deps.fs);
  const warnings: string[] = [];
  const present = deps.pathHasBin ? deps.pathHasBin() : hasOnPath("dup-scout");
  if (!present) {
    warnings.push("`dup-scout` was not found on PATH; the /dup-scout command shells out to it. Install globally with `npm i -g dup-scout`.");
  }
  return { results, warnings };
}
```

> Note on template escaping: the template constants are delimited by backticks,
> so every literal backtick in the guidance text (around `dup-scout`) is written
> as backslash-backtick inside the template — exactly as shown in the code above.
> Copy the code verbatim; do not add or remove backslashes.

- [ ] **Step 4: Run install-unit tests**

Run: `npx vitest run test/install.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the `install` subcommand into `src/cli.ts`**

Add imports at the top of `src/cli.ts`:
```ts
import { installCommand, type InstallFs } from "./install.js";
```

Extend `CliDeps` (add the injection point):
```ts
export interface CliDeps {
  run?: typeof engineRun;
  write?: (s: string) => void;
  exit?: (code: number) => void;
  installFs?: InstallFs;
}
```

In `buildProgram`, replace the `// NOTE: Task 14 adds ...` line with:
```ts
  program
    .command("install")
    .description("install the /dup-scout slash command into Claude Code and/or Codex")
    .option("--claude", "install into Claude Code (~/.claude/commands)")
    .option("--codex", "install into Codex (~/.codex/prompts)")
    .option("--all", "install into both (default when no agent flag is given)")
    .option("--force", "overwrite existing command files")
    .action((opts: { claude?: boolean; codex?: boolean; all?: boolean; force?: boolean }) => {
      const { results, warnings } = installCommand(opts, { fs: deps.installFs });
      for (const r of results) {
        filled.write(
          r.status === "written"
            ? `installed: ${r.name} -> ${r.file}`
            : `skipped (exists, use --force): ${r.name} -> ${r.file}`,
        );
      }
      for (const w of warnings) filled.write(`warning: ${w}`);
    });
```

- [ ] **Step 6: Add an install case to `test/cli.test.ts`**

Append this block inside `test/cli.test.ts`:
```ts
import { describe as describe2, it as it2, expect as expect2, vi as vi2 } from "vitest";
import { runCli as runCli2 } from "../src/cli.js";

describe2("runCli install", () => {
  it2("writes command files for both agents and reports status", async () => {
    const write = vi2.fn();
    const written: Record<string, string> = {};
    const installFs = { exists: () => false, mkdir: () => {}, write: (p: string, d: string) => { written[p] = d; } };
    await runCli2(["node", "dup-scout", "install", "--all"], { write, installFs });
    expect2(write).toHaveBeenCalledWith(expect2.stringContaining("dup-scout.md"));
    expect2(Object.keys(written).length).toBe(2);
  });
});
```

- [ ] **Step 7: Run tests, build, lint**

Run: `npx vitest run test/install.test.ts test/cli.test.ts`
Expected: PASS.
Run: `npm test && npm run build && npm run lint`
Expected: all green. Fix any format issues with `npm run format` and re-run lint.

- [ ] **Step 8: Commit**

```bash
git add src/install.ts src/cli.ts test/install.test.ts test/cli.test.ts
git commit -m "feat: dup-scout install subcommand for Claude Code and Codex"
```

---

### Task 15: Publish metadata, docs & CI

**Files:**
- Create: `README.md`, `CHANGELOG.md`, `LICENSE`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Test: manual smoke run (documented below)

**Interfaces:**
- Consumes: the finished CLI.
- Produces: publishable package docs and CI/release automation.

- [ ] **Step 1: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Jerry Luong

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Dup-Scout

Prior-art / duplicate checker for bug bounty findings. Point it at a target's
GitHub repo, describe your finding, and Dup-Scout scans PRs (open/closed/merged),
issues, commits (including silent fixes after your in-scope tag), releases, and
web3 audit sources to estimate whether the finding will be flagged
**duplicate / known-issue / already-fixed** — before you write the report.

## Install

```bash
npm install -g dup-scout
# or run without installing:
npx dup-scout <owner/repo> --title "..." --desc "..."
```

## Auth

Dup-Scout resolves a GitHub token from (in order): `--token`, `GITHUB_TOKEN`,
`GH_TOKEN`, then `gh auth token`. Unauthenticated runs work but hit low rate
limits. A read-only token is sufficient.

## Usage

```bash
dup-scout acme/vault \
  --title "Reentrancy in claim lets attacker drain" \
  --desc "claim() reenters via _settle before state update" \
  --file src/Vault.sol --function claim --scope-tag v1.2.0

# structured finding from a file:
dup-scout acme/vault --finding finding.md --markdown

# CI gate: exit non-zero if it looks like a duplicate
dup-scout acme/vault --finding finding.md --fail-on DUPLICATE
```

### Finding markdown format

```markdown
# Reentrancy in claim lets attacker drain

claim() reenters via _settle before the balance is updated.

File: src/Vault.sol
Functions: claim, _settle
Scope-Tag: v1.2.0
Bug-Class: reentrancy
```

## Verdicts

| Verdict | Meaning |
|---|---|
| `DUPLICATE` | Same function + root cause already in a merged PR / closed issue / contest finding |
| `KNOWN-ISSUE` | Acknowledged / won't-fix in a past audit report |
| `SILENTLY-FIXED` | Affected file changed after your in-scope tag (check the program's undeployed-fix rules) |
| `PARTIAL-OVERLAP` | Same bug class, different location — argue distinctness |
| `NOVEL` | No qualifying prior art found in enabled sources |

## Sources

`github-prs`, `github-issues`, `github-commits`, `github-releases`,
`github-code`, `audit-reports`, `contests` (guided). Enable a subset with
`--sources github-prs,audit-reports`.

> The `contests` source is *guided*: it emits candidate Code4rena / Sherlock /
> Cantina / Immunefi search URLs to check manually. Provide a fetch hook via the
> library API to auto-scan them.

## Agent integration (Claude Code & Codex)

Register a `/dup-scout` slash command inside both agents so you can run a
duplicate check without leaving your session:

```bash
dup-scout install          # installs into both Claude Code and Codex
dup-scout install --claude  # Claude Code only  (~/.claude/commands/dup-scout.md)
dup-scout install --codex   # Codex only         (~/.codex/prompts/dup-scout.md)
dup-scout install --force   # overwrite existing command files
```

`install` honours `CLAUDE_CONFIG_DIR` and `CODEX_HOME` if set. It never runs on
`npm install` — it's an explicit opt-in step. Then, inside either agent:

```
/dup-scout acme/vault reentrancy in claim() lets an attacker drain the vault
```

The command shells out to the `dup-scout` CLI (install it globally first with
`npm i -g dup-scout`) and summarizes the verdict.

## Library use

```ts
import { run } from "dup-scout";
const verdict = await run({ repo: "acme/vault", finding: { title: "...", description: "..." } });
```

## Caveats

Dup-Scout estimates duplicate likelihood; it is not a substitute for reading the
program's scope, known-issues list, and prior-audit clause. Always confirm
matches by hand before deciding not to submit.

## License

MIT
````

- [ ] **Step 3: Write `CHANGELOG.md`**

```markdown
# Changelog

## 0.1.0 (unreleased)

- Initial release: engine, GitHub PR/issue/commit/release/code sources,
  web3 audit-report and guided contest sources, terminal/json/markdown
  reporters, the `dup-scout` CLI with CI-friendly exit codes, and a
  `dup-scout install` subcommand that registers a `/dup-scout` slash command
  in Claude Code and Codex.
```

- [ ] **Step 4: Write `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 5: Write `.github/workflows/release.yml`**

```yaml
name: release
on:
  push:
    tags: ["v*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 6: Manual smoke run**

Run (against any public repo you have a token for):
```bash
npm run build
node dist/cli.js expressjs/express \
  --title "prototype pollution in qs merge" \
  --desc "merge deep-copies attacker keys __proto__" \
  --function merge --markdown --min-score 30
```
Expected: a coherent verdict + evidence table (or `NOVEL` with manual-check
notes), no unhandled promise rejection, and sane behavior if the token is
missing (rate-limit warning on stderr, not a crash).

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md LICENSE .github
git commit -m "docs: README, changelog, license, and CI/release workflows"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2 Tech & packaging (lib + CLI install) | 1, 15 |
| §3 Architecture — engine + registry | 6, 12 |
| §3 Core units table | 2–13 |
| §3 Key data types | 2 |
| §4 GitHub sources (prs/issues/commits/releases/code) | 7, 8 |
| §4 Silent-fix detection | 8 |
| §4 web3 audit-reports | 9 |
| §4 web3 contests (guided) | 10 |
| §4 Extensibility (register custom sources) | 6, 12 (`registry` injection) |
| §5 Key extraction | 3 |
| §5 Scoring + verdict matrix | 4 |
| §6 CLI UX (flags, formats, exit codes, dry-run) | 13 |
| §6a `install` subcommand (Claude + Codex, env overrides, no silent postinstall) | 14 |
| §7 Testing (mocked octokit, no live net, smoke) | every task + 15 |
| §8 Repo layout (incl. `src/install.ts`) | matches File Structure |
| §9 Resolved decisions (name/MIT/guided/agent-install) | 1, 10, 14, 15 |

No spec section is left without a task.

**2. Placeholder scan:** No "TBD"/"implement later"/"add error handling" placeholders — every code step contains complete code. Source failure handling is concrete (`safeSearch` in Task 12). Config-file loading (`.dupscout.json`) from spec §4 is intentionally deferred as a post-0.1 enhancement — sources are already runtime-pluggable via the `registry` option, so `.dupscout.json` is not required for the described functionality. (Noted here so it is a conscious cut, not a silent gap.)

**3. Type consistency:** Verified across tasks — `RawMatch`/`Match`/`WeightedKey`/`SearchContext`/`SourceResult`/`Source` defined once in Task 2 and consumed unchanged; `run`/`RunOptions` defined in Task 12 and consumed by the CLI in Task 13; `scoreMatch`/`aggregate`/`THRESHOLDS` names stable between Tasks 4, 12; source ids (`github-prs`, `github-issues`, `github-commits`, `github-releases`, `github-code`, `audit-reports`, `contests`) consistent between source modules, registry, and CLI `--sources`. Task 14 additions are consistent: `CliDeps`/`CliOptions`/`buildProgram` defined in Task 13 and extended (not redefined) in Task 14; `InstallFs`/`InstallTarget`/`InstallResult`/`installCommand` defined in `src/install.ts` (Task 14) and consumed only by `src/cli.ts`.
