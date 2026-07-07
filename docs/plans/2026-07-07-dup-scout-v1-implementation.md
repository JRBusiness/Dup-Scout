# Dup-Scout v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate Dup-Scout to a provably-good v1.0 — per-term merged retrieval (find the exact prior-art item GitHub's ranking buries), high-signal key extraction, and a deterministic recorded-fixture benchmark that gates recall + verdict accuracy in CI.

**Architecture:** Retrieval moves from one OR-union query to per-term scoped queries merged/deduped by id, run through a shared paginating helper with a hard per-run request budget and octokit throttling/retry. Key extraction recognizes distinctive tokens (enums, selectors, errors, identifiers) and weights them highest. A benchmark harness injects a method-level record/replay GitHub client via a `clientFactory` DI point and measures Recall@K + verdict accuracy against committed fixtures.

**Tech Stack:** TypeScript strict ESM (NodeNext), `@octokit/rest` + `@octokit/plugin-throttling` + `@octokit/plugin-retry`, `commander`, `vitest`, `tsup`, `tsx` (benchmark runner), eslint + prettier.

## Global Constraints

- **Node** `>=18`, ESM only; local imports use explicit `.js` extensions.
- **TypeScript** `strict`, target ES2022.
- **No live network in unit tests** (`test/**`); octokit/fetch always mocked or injected. The benchmark replay run is also network-free; only `npm run bench:live` hits GitHub.
- **Commits** authored by the machine git identity `JRBusiness <bryan.tieu1229@gmail.com>`; NO `Co-Authored-By` / Claude / AI attribution.
- Keep `npm run lint` green — run `npm run format` before committing.
- **Version:** bump `package.json` to `1.0.0` in the final task.
- Public library exports unchanged except additive: `run`, `RunOptions`, and types `Finding`, `Match`, `Verdict`, `Source`.
- Retrieval defaults (exact values): `SEARCH_PER_PAGE = 100`, `MAX_PAGES = 2`, `DEFAULT_BUDGET = 40`, high-signal `N = 6` terms.

---

## File Structure

```
src/github/retrieval.ts   # NEW: RetrievalBudget, makeBudget, searchPaged, mergeById, runSearches
src/verdict.ts            # NEW: VERDICT_RANK + verdictRank (extracted from cli.ts)
src/github/client.ts      # MOD: octokit throttling/retry plugins + optional fetch injection
src/engine.ts             # MOD: clientFactory DI + per-run RetrievalBudget in ctx
src/types.ts              # MOD: SearchContext.budget
src/keys.ts               # MOD: high-signal token classification
src/sources/query.ts      # MOD: highSignalTerms + queriesFor
src/sources/githubPrs.ts      # MOD: per-term merged retrieval
src/sources/githubIssues.ts   # MOD: per-term merged retrieval
src/sources/githubCommits.ts  # MOD: per-term merged retrieval
src/sources/githubCode.ts     # MOD: per-term merged retrieval
src/sources/githubReleases.ts # MOD: budget decrement (list call)
src/cli.ts                # MOD: import verdictRank from ./verdict.js
benchmark/metrics.ts      # NEW: recallAtK, verdictMeets
benchmark/replayClient.ts # NEW: record/replay GithubClient factories
benchmark/cases/*.json    # NEW: labeled findings + expectations
benchmark/fixtures/*.json # NEW: recorded GitHub responses (committed)
benchmark/thresholds.json # NEW: metric floors
benchmark/run.ts          # NEW: runner + metrics + regression gate
vitest.config.ts          # NEW: scope default test run to test/**
.github/workflows/ci.yml  # MOD: add bench job
package.json / README / CHANGELOG # MOD
```

---

### Task 1: Retrieval helpers (budget, pagination, merge)

**Files:**
- Create: `src/github/retrieval.ts`
- Modify: `src/types.ts` (add `SearchContext.budget`)
- Test: `test/retrieval.test.ts`

**Interfaces:**
- Consumes: `SEARCH_PER_PAGE` from `src/sources/constants.ts`.
- Produces:
  - `interface RetrievalBudget { remaining: number }`
  - `const MAX_PAGES = 2`, `const DEFAULT_BUDGET = 40`
  - `makeBudget(max?: number): RetrievalBudget`
  - `interface SearchPage<T> { data: { items: T[]; total_count?: number } }`
  - `searchPaged<T>(call: (page: number) => Promise<SearchPage<T>>, opts: { maxPages: number; budget: RetrievalBudget }): Promise<{ items: T[]; total: number; truncated: boolean }>`
  - `mergeById<T>(groups: T[][], idOf: (t: T) => string): T[]`
  - `runSearches<T>(queries: string[], call: (q: string, page: number) => Promise<SearchPage<T>>, idOf: (t: T) => string, opts: { maxPages?: number; budget: RetrievalBudget }): Promise<{ items: T[]; truncated: boolean; total: number }>`
  - `SearchContext.budget?: RetrievalBudget` (type-only ref in types.ts)

- [ ] **Step 1: Write the failing test `test/retrieval.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { makeBudget, searchPaged, mergeById, runSearches } from "../src/github/retrieval.js";

function page(items: number[], total: number) {
  return { data: { items: items.map((n) => ({ n })), total_count: total } };
}

describe("makeBudget", () => {
  it("defaults to 40", () => {
    expect(makeBudget().remaining).toBe(40);
    expect(makeBudget(5).remaining).toBe(5);
  });
});

describe("searchPaged", () => {
  it("stops at maxPages, decrements budget, and flags truncation", async () => {
    const budget = makeBudget(10);
    const call = vi.fn(async (p: number) => page([p], 250)); // always a full-looking page
    const r = await searchPaged(call, { maxPages: 2, budget });
    expect(call).toHaveBeenCalledTimes(2);
    expect(budget.remaining).toBe(8);
    expect(r.truncated).toBe(true); // total 250 > fetched 2
    expect(r.items).toHaveLength(2);
  });

  it("stops early on a short page and is not truncated when total is covered", async () => {
    const budget = makeBudget(10);
    const call = vi.fn(async () => ({ data: { items: [{ n: 1 }, { n: 2 }], total_count: 2 } }));
    const r = await searchPaged(call, { maxPages: 5, budget });
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.truncated).toBe(false);
  });

  it("stops when the budget is exhausted and flags truncation", async () => {
    const budget = makeBudget(1);
    const call = vi.fn(async (p: number) => page([p], 999));
    const r = await searchPaged(call, { maxPages: 5, budget });
    expect(call).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
    expect(r.truncated).toBe(true);
  });
});

describe("mergeById", () => {
  it("dedups across groups keeping first occurrence", () => {
    const merged = mergeById([[{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]], (x) => x.id);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("runSearches", () => {
  it("runs each query and merges deduped results", async () => {
    const budget = makeBudget(40);
    const responses: Record<string, { n: number }[]> = {
      q1: [{ n: 1 }, { n: 2 }],
      q2: [{ n: 2 }, { n: 3 }],
    };
    const call = vi.fn(async (q: string) => ({ data: { items: responses[q], total_count: responses[q].length } }));
    const r = await runSearches(["q1", "q2"], call, (x) => String(x.n), { budget });
    expect(r.items.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/retrieval.test.ts`
Expected: FAIL — cannot find module `../src/github/retrieval.js`.

- [ ] **Step 3: Write `src/github/retrieval.ts`**

```ts
import { SEARCH_PER_PAGE } from "../sources/constants.js";

export interface RetrievalBudget {
  remaining: number;
}

export const MAX_PAGES = 2;
export const DEFAULT_BUDGET = 40;

export function makeBudget(max: number = DEFAULT_BUDGET): RetrievalBudget {
  return { remaining: max };
}

export interface SearchPage<T> {
  data: { items: T[]; total_count?: number };
}

export async function searchPaged<T>(
  call: (page: number) => Promise<SearchPage<T>>,
  opts: { maxPages: number; budget: RetrievalBudget },
): Promise<{ items: T[]; total: number; truncated: boolean }> {
  const items: T[] = [];
  let total = 0;
  let truncated = false;
  for (let page = 1; page <= opts.maxPages; page++) {
    if (opts.budget.remaining <= 0) {
      truncated = true;
      break;
    }
    opts.budget.remaining -= 1;
    const res = await call(page);
    const pageItems = res.data.items ?? [];
    items.push(...pageItems);
    total = res.data.total_count ?? items.length;
    if (pageItems.length < SEARCH_PER_PAGE) break; // last page reached
  }
  if (total > items.length) truncated = true;
  return { items, total, truncated };
}

export function mergeById<T>(groups: T[][], idOf: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const item of group) {
      const id = idOf(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}

export async function runSearches<T>(
  queries: string[],
  call: (q: string, page: number) => Promise<SearchPage<T>>,
  idOf: (t: T) => string,
  opts: { maxPages?: number; budget: RetrievalBudget },
): Promise<{ items: T[]; truncated: boolean; total: number }> {
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const groups: T[][] = [];
  let truncated = false;
  let total = 0;
  for (const q of queries) {
    const r = await searchPaged((page) => call(q, page), { maxPages, budget: opts.budget });
    groups.push(r.items);
    truncated = truncated || r.truncated;
    total = Math.max(total, r.total);
  }
  return { items: mergeById(groups, idOf), truncated, total };
}
```

- [ ] **Step 4: Add `budget` to `SearchContext` in `src/types.ts`**

Find the `SearchContext` interface and add the `budget` field:
```ts
export interface SearchContext {
  client: import("./github/client.js").GithubClient;
  finding: Finding;
  keys: WeightedKey[];
  dryRun?: boolean;
  fetch?: FetchFn;
  log: (msg: string) => void;
  budget?: import("./github/retrieval.js").RetrievalBudget;
}
```
(Add only the `budget?:` line to the existing interface; keep every other field unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/retrieval.test.ts`
Expected: PASS (7 assertions across the describes).

- [ ] **Step 6: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/github/retrieval.ts src/types.ts test/retrieval.test.ts
git commit -m "feat: retrieval helpers (budget, pagination, merge-by-id)"
```

---

### Task 2: Octokit throttling/retry + clientFactory DI

**Files:**
- Modify: `src/github/client.ts`, `src/engine.ts`
- Test: `test/engine.test.ts` (add a clientFactory-injection test)
- Also: `npm install` two deps.

**Interfaces:**
- Consumes: `makeBudget` from `src/github/retrieval.js`.
- Produces:
  - `createGithubClient(repo: string, token?: string, fetchImpl?: typeof fetch): GithubClient` (adds optional `fetchImpl`).
  - `RunOptions.clientFactory?: (repo: string, token?: string) => GithubClient`
  - `run()` creates a per-run `RetrievalBudget` and sets `ctx.budget`.

- [ ] **Step 1: Install the octokit plugins**

Run: `npm install @octokit/plugin-throttling@^9.0.0 @octokit/plugin-retry@^7.0.0`
Expected: both added to `dependencies`.

- [ ] **Step 2: Write the failing test — add to `test/engine.test.ts`**

Append this `describe` block to the existing `test/engine.test.ts`:
```ts
describe("run clientFactory injection", () => {
  it("uses an injected clientFactory instead of the real GitHub client", async () => {
    const { run } = await import("../src/engine.js");
    const { SourceRegistry } = await import("../src/sources/index.js");
    let sawClient = false;
    const fakeClient = { owner: "acme", repo: "vault", octokit: {} } as never;
    const registry = new SourceRegistry();
    registry.register({
      id: "probe",
      enabledByDefault: true,
      async search(ctx) {
        sawClient = ctx.client === fakeClient && ctx.budget !== undefined;
        return { matches: [] };
      },
    });
    await run({
      repo: "acme/vault",
      finding: { title: "x", description: "" },
      registry,
      clientFactory: () => fakeClient,
    });
    expect(sawClient).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL — `clientFactory` is not an accepted RunOptions field / `ctx.budget` undefined.

- [ ] **Step 4: Rewrite `src/github/client.ts`**

```ts
import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const DupOctokit = Octokit.plugin(throttling, retry);

export interface GithubClient {
  octokit: InstanceType<typeof DupOctokit>;
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

export function createGithubClient(
  repo: string,
  token?: string,
  fetchImpl?: typeof fetch,
): GithubClient {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid repo "${repo}", expected owner/repo`);
  }
  const octokit = new DupOctokit({
    auth: resolveToken({ explicit: token }),
    request: fetchImpl ? { fetch: fetchImpl } : undefined,
    throttle: {
      onRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
      onSecondaryRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
    },
  });
  return { octokit, owner, repo: name };
}
```

- [ ] **Step 5: Wire `clientFactory` + budget into `src/engine.ts`**

Add the import near the top:
```ts
import { makeBudget } from "./github/retrieval.js";
```
Add `clientFactory` to the `RunOptions` interface (keep all existing fields):
```ts
  clientFactory?: (repo: string, token?: string) => GithubClient;
```
Ensure `GithubClient` is imported as a type in engine.ts (it already imports `createGithubClient`; add the type import if missing):
```ts
import { createGithubClient, type GithubClient } from "./github/client.js";
```
In `run()`, replace the client creation and add the budget to `ctx`:
```ts
  const client = (opts.clientFactory ?? createGithubClient)(opts.repo, opts.token);
  const keys = extractKeys(opts.finding);
  const registry = opts.registry ?? defaultRegistry();
  const sources = registry.select(opts.sources);
  const log = opts.log ?? ((): void => {});
  const budget = makeBudget();

  const ctx: SearchContext = {
    client,
    finding: opts.finding,
    keys,
    dryRun: opts.dryRun,
    fetch: opts.fetch,
    log,
    budget,
  };
```
(Adjust to match the existing variable names in engine.ts; only the `client` line, the new `budget` line, and adding `budget` to `ctx` change.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/engine.test.ts test/github-client.test.ts`
Expected: PASS (existing engine + client tests plus the new injection test).

- [ ] **Step 7: Format, lint, commit**

```bash
npm run format
npm run lint
git add package.json package-lock.json src/github/client.ts src/engine.ts test/engine.test.ts
git commit -m "feat: octokit throttling/retry plugins and clientFactory DI"
```

---

### Task 3: High-signal query building

**Files:**
- Modify: `src/sources/query.ts`
- Test: `test/sources-query.test.ts` (add cases)

**Interfaces:**
- Consumes: `WeightedKey`, `SearchContext`; the existing `KIND_PRIORITY`/`keyTerms`.
- Produces:
  - `highSignalTerms(keys: WeightedKey[], max?: number): string[]` (default 6; distinctive-first; quotes multiword; excludes generic)
  - `queriesFor(ctx: SearchContext, typeQualifier: string): string[]` — `[broadOrUnion, ...perTermScoped]`, deduped, each scoped to `repo:owner/name [typeQualifier]`.

- [ ] **Step 1: Write the failing test — add to `test/sources-query.test.ts`**

```ts
import { highSignalTerms, queriesFor } from "../src/sources/query.js";

describe("highSignalTerms", () => {
  it("returns distinctive-first, non-generic, quoted terms up to max", () => {
    const mixed: WeightedKey[] = [
      { term: "notification", weight: 4, kind: "invariant" },
      { term: "InsufficientBalance", weight: 6, kind: "error" },
      { term: "the", weight: 1, kind: "generic" },
      { term: "share price", weight: 4, kind: "invariant" },
    ];
    const t = highSignalTerms(mixed, 3);
    expect(t[0]).toBe("InsufficientBalance");
    expect(t).toContain('"share price"');
    expect(t).not.toContain("the");
    expect(t).toHaveLength(3);
  });
});

describe("queriesFor", () => {
  it("builds a broad OR query plus one scoped query per high-signal term", () => {
    const keys: WeightedKey[] = [
      { term: "WAITING_FOR_SIGNATURES", weight: 6, kind: "selector" },
      { term: "notification", weight: 4, kind: "invariant" },
    ];
    const ctx = { client: { owner: "acme", repo: "vault" }, keys } as unknown as SearchContext;
    const qs = queriesFor(ctx, "type:pr");
    expect(qs[0]).toMatch(/^repo:acme\/vault type:pr /);
    expect(qs.some((q) => q === "repo:acme/vault type:pr WAITING_FOR_SIGNATURES")).toBe(true);
    expect(qs.some((q) => q === "repo:acme/vault type:pr notification")).toBe(true);
    // deduped, no empty-term queries
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("supports an empty type qualifier (commits/code)", () => {
    const keys: WeightedKey[] = [{ term: "claimReward", weight: 5, kind: "function" }];
    const ctx = { client: { owner: "a", repo: "b" }, keys } as unknown as SearchContext;
    const qs = queriesFor(ctx, "");
    expect(qs).toContain("repo:a/b claimReward");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sources-query.test.ts`
Expected: FAIL — `highSignalTerms`/`queriesFor` not exported.

- [ ] **Step 3: Add `highSignalTerms` + `queriesFor` to `src/sources/query.ts`**

Append (below the existing `keyTerms`/`buildQuery`, reusing `KIND_PRIORITY`):
```ts
export function highSignalTerms(keys: WeightedKey[], max = 6): string[] {
  return [...keys]
    .filter((k) => k.kind !== "generic")
    .sort(
      (a, b) =>
        KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] ||
        b.weight - a.weight ||
        b.term.length - a.term.length,
    )
    .slice(0, max)
    .map((k) => (k.term.includes(" ") ? `"${k.term}"` : k.term));
}

export function queriesFor(ctx: SearchContext, typeQualifier: string): string[] {
  const base = `repo:${ctx.client.owner}/${ctx.client.repo}${typeQualifier ? ` ${typeQualifier}` : ""}`;
  const broadTerms = keyTerms(ctx.keys);
  const queries: string[] = [];
  if (broadTerms) queries.push(`${base} ${broadTerms}`.trim());
  for (const term of highSignalTerms(ctx.keys)) {
    queries.push(`${base} ${term}`.trim());
  }
  return Array.from(new Set(queries)).filter((q) => q !== base);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/sources-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/sources/query.ts test/sources-query.test.ts
git commit -m "feat: high-signal term selection and per-term query building"
```

---

### Task 4: High-signal key extraction

**Files:**
- Modify: `src/keys.ts`
- Test: `test/keys.test.ts` (add cases)

**Interfaces:**
- Consumes: `Finding`, `KeyKind`, `WeightedKey`.
- Produces: updated `extractKeys` classifying selectors/enums (`selector`, w6), PascalCase errors (`error`, w6), camelCase/`_snake` identifiers (`function`, w5), else generic (w1). Existing explicit-field weighting unchanged.

- [ ] **Step 1: Write the failing test — add to `test/keys.test.ts`**

```ts
describe("extractKeys high-signal tokens", () => {
  it("classifies enums, selectors, errors, and identifiers with high weight", () => {
    const keys = extractKeys({
      title: "Missed WAITING_FOR_SIGNATURES via clearNewIndicatorForUser",
      description: "throws InsufficientBalance; selector 0xa9059cbb",
    });
    const byTerm = (t: string) => keys.find((k) => k.term === t);
    expect(byTerm("WAITING_FOR_SIGNATURES")).toMatchObject({ kind: "selector", weight: 6 });
    expect(byTerm("0xa9059cbb")).toMatchObject({ kind: "selector", weight: 6 });
    expect(byTerm("InsufficientBalance")).toMatchObject({ kind: "error", weight: 6 });
    expect(byTerm("clearNewIndicatorForUser")).toMatchObject({ kind: "function", weight: 5 });
  });

  it("keeps single all-caps or single-hump words generic", () => {
    const keys = extractKeys({ title: "The WAITING transaction failed", description: "" });
    expect(keys.find((k) => k.term.toLowerCase() === "waiting")?.kind ?? "generic").toBe("generic");
    expect(keys.find((k) => k.term.toLowerCase() === "transaction")?.kind ?? "generic").toBe(
      "generic",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/keys.test.ts`
Expected: FAIL — enum/selector/error tokens are classified generic (or missed).

- [ ] **Step 3: Update the free-text scan in `src/keys.ts`**

Replace the existing free-text `for (const m of text.matchAll(...))` loop with:
```ts
  const SELECTOR_RE = /^0x[0-9a-f]{6,}$/i;
  const SCREAMING_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/; // WAITING_FOR_SIGNATURES
  const PASCAL_RE = /^(?:[A-Z][a-z0-9]+){2,}$/; // InsufficientBalance
  const IDENTIFIER_RE = /^_[a-z]|[a-z][A-Z]|[a-z]_[a-z]/; // clearNewIndicatorForUser, _settle, get_reward

  const text = `${finding.title} ${finding.description}`;
  for (const m of text.matchAll(/0x[0-9a-fA-F]{6,}|[A-Za-z_][A-Za-z0-9_]{3,}/g)) {
    const w = m[0];
    if (SELECTOR_RE.test(w) || SCREAMING_RE.test(w)) push(w, 6, "selector");
    else if (PASCAL_RE.test(w)) push(w, 6, "error");
    else if (IDENTIFIER_RE.test(w)) push(w, 5, "function");
    else push(w.toLowerCase(), 1, "generic");
  }
  return keys;
```
(This replaces the previous loop that only distinguished camelCase/underscore from generic. Keep everything above it — the explicit functions/file/keys/bugClass handling — unchanged. Remove the now-duplicated old `const text = ...` line and old loop.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/keys.test.ts`
Expected: PASS (existing key tests + the two new ones).

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/keys.ts test/keys.test.ts
git commit -m "feat: high-signal token classification in key extraction"
```

---

### Task 5: Per-term retrieval — github-prs & github-issues

**Files:**
- Modify: `src/sources/githubPrs.ts`, `src/sources/githubIssues.ts`
- Test: `test/github-prs-issues.test.ts` (extend)

**Interfaces:**
- Consumes: `queriesFor` (query.js), `runSearches`/`makeBudget` (retrieval.js), `securitySignals`, `SNIPPET_LEN`, `SearchContext.budget`.
- Produces: unchanged `githubPrs`/`githubIssues` Source shape; internally per-term merged retrieval.

- [ ] **Step 1: Write the failing test — extend `test/github-prs-issues.test.ts`**

Add a helper that returns different items per query and a test asserting a term-only match is retrieved and deduped:
```ts
import { makeBudget } from "../src/github/retrieval.js";

function ctxMultiQuery(byQuery: Record<string, unknown[]>): SearchContext {
  const issuesAndPullRequests = vi.fn(async ({ q }: { q: string }) => ({
    data: { items: byQuery[q] ?? [], total_count: (byQuery[q] ?? []).length },
  }));
  return {
    client: {
      owner: "acme",
      repo: "vault",
      octokit: { rest: { search: { issuesAndPullRequests } } },
    },
    finding: { title: "Reentrancy in claim", description: "throws BadState", functions: ["claim"] },
    keys: [
      { term: "claim", weight: 5, kind: "function" },
      { term: "BadState", weight: 6, kind: "error" },
    ],
    budget: makeBudget(40),
    log: () => {},
  } as unknown as SearchContext;
}

describe("githubPrs per-term retrieval", () => {
  it("retrieves an item that only the per-term query returns, deduped", async () => {
    const broad = "repo:acme/vault type:pr claim OR BadState";
    const perError = "repo:acme/vault type:pr BadState";
    const ctx = ctxMultiQuery({
      [broad]: [{ number: 1, html_url: "u1", title: "unrelated", state: "open" }],
      [perError]: [{ number: 42, html_url: "u42", title: "fix: BadState on claim", state: "closed" }],
    });
    const res = await githubPrs.search(ctx);
    const ids = res.matches.map((m) => m.id);
    expect(ids).toContain("#42");
    expect(new Set(ids).size).toBe(ids.length); // deduped
  });
});
```
(Keep the existing dryRun + basic mapping tests; they still pass with the new code because a single-query mock returns the same items for every query and dedup collapses them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/github-prs-issues.test.ts`
Expected: FAIL — the old single-query source ignores per-term queries so `#42` is missing.

- [ ] **Step 3: Rewrite `src/sources/githubPrs.ts`**

```ts
import type { RawMatch, Source } from "../types.js";
import { queriesFor } from "./query.js";
import { securitySignals } from "./signals.js";
import { SNIPPET_LEN } from "./constants.js";
import { makeBudget, runSearches } from "../github/retrieval.js";

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
    const queries = queriesFor(ctx, "type:pr");
    if (ctx.dryRun) {
      for (const q of queries) ctx.log(`[github-prs] ${q}`);
      return { matches: [] };
    }
    const budget = ctx.budget ?? makeBudget();
    const { items, truncated } = await runSearches<SearchItem>(
      queries,
      (q, page) =>
        ctx.client.octokit.rest.search.issuesAndPullRequests({ q, per_page: 100, page }),
      (it) => `#${it.number}`,
      { budget },
    );
    const matches = items.map((it): RawMatch => ({
      sourceId: "github-prs",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.pull_request?.merged_at ? "merged" : it.state,
      snippet: (it.body ?? "").slice(0, SNIPPET_LEN),
      signals: securitySignals(it.title),
    }));
    if (truncated) {
      ctx.log(
        `[github-prs] result set was truncated (rate/page/budget limit); ` +
          `add distinctive terms (function/error names) for better recall.`,
      );
    }
    return { matches };
  },
};
```

- [ ] **Step 4: Rewrite `src/sources/githubIssues.ts`**

```ts
import type { RawMatch, Source } from "../types.js";
import { queriesFor } from "./query.js";
import { securitySignals } from "./signals.js";
import { SNIPPET_LEN } from "./constants.js";
import { makeBudget, runSearches } from "../github/retrieval.js";

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
    const queries = queriesFor(ctx, "type:issue");
    if (ctx.dryRun) {
      for (const q of queries) ctx.log(`[github-issues] ${q}`);
      return { matches: [] };
    }
    const budget = ctx.budget ?? makeBudget();
    const { items, truncated } = await runSearches<SearchItem>(
      queries,
      (q, page) =>
        ctx.client.octokit.rest.search.issuesAndPullRequests({ q, per_page: 100, page }),
      (it) => `#${it.number}`,
      { budget },
    );
    const matches = items.map((it): RawMatch => ({
      sourceId: "github-issues",
      id: `#${it.number}`,
      url: it.html_url,
      title: it.title,
      state: it.state,
      snippet: (it.body ?? "").slice(0, SNIPPET_LEN),
      signals: securitySignals(it.title),
    }));
    if (truncated) {
      ctx.log(
        `[github-issues] result set was truncated (rate/page/budget limit); ` +
          `add distinctive terms (function/error names) for better recall.`,
      );
    }
    return { matches };
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/github-prs-issues.test.ts`
Expected: PASS.

- [ ] **Step 6: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/sources/githubPrs.ts src/sources/githubIssues.ts test/github-prs-issues.test.ts
git commit -m "feat: per-term merged retrieval for PR and issue sources"
```

---

### Task 6: Per-term retrieval — github-commits & github-code (+ releases budget)

**Files:**
- Modify: `src/sources/githubCommits.ts`, `src/sources/githubCode.ts`, `src/sources/githubReleases.ts`
- Test: `test/github-commits.test.ts`, `test/github-releases-code.test.ts` (extend)

**Interfaces:**
- Consumes: `queriesFor`, `runSearches`/`makeBudget`, `SNIPPET_LEN`, `SEARCH_PER_PAGE`.
- Produces: unchanged Source shapes; per-term retrieval for commits & code; releases decrements the shared budget by 1 for its single list call.

- [ ] **Step 1: Write the failing test — extend `test/github-commits.test.ts`**

Add to the `ctx(...)` factory a `budget` and a multi-query commits test:
```ts
import { makeBudget } from "../src/github/retrieval.js";

describe("githubCommits per-term retrieval", () => {
  it("merges commit results across per-term queries, deduped", async () => {
    const byQuery: Record<string, unknown[]> = {
      "repo:acme/vault settle OR ROUND_DOWN": [
        { sha: "aaaaaaa1", html_url: "c1", commit: { message: "chore" } },
      ],
      "repo:acme/vault ROUND_DOWN": [
        { sha: "bbbbbbb2", html_url: "c2", commit: { message: "fix ROUND_DOWN in settle" } },
      ],
      "repo:acme/vault settle": [
        { sha: "aaaaaaa1", html_url: "c1", commit: { message: "chore" } },
      ],
    };
    const commits = vi.fn(async ({ q }: { q: string }) => ({
      data: { items: byQuery[q] ?? [], total_count: (byQuery[q] ?? []).length },
    }));
    const ctx = {
      client: { owner: "acme", repo: "vault", octokit: { rest: { search: { commits } } } },
      finding: { title: "settle rounds via ROUND_DOWN", description: "", functions: ["settle"] },
      keys: [
        { term: "settle", weight: 5, kind: "function" },
        { term: "ROUND_DOWN", weight: 6, kind: "selector" },
      ],
      budget: makeBudget(40),
      log: () => {},
    } as unknown as SearchContext;
    const res = await githubCommits.search(ctx);
    const ids = res.matches.map((m) => m.id);
    expect(ids).toContain("bbbbbbb");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```
(The existing silent-fix and single-query commit tests remain valid — a single-query mock returns the same items for every query and dedup collapses them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/github-commits.test.ts`
Expected: FAIL — old single-query source misses the per-term commit.

- [ ] **Step 3: Rewrite the search portion of `src/sources/githubCommits.ts`**

Replace the imports and the commit-search block (keep the silent-fix block below it, only changing its `slice(0, 300)` already done to `SNIPPET_LEN`):
```ts
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
```

- [ ] **Step 4: Run commits tests**

Run: `npx vitest run test/github-commits.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `src/sources/githubCode.ts`**

```ts
import type { RawMatch, Source } from "../types.js";
import { highSignalTerms, keyTerms } from "./query.js";
import { makeBudget, runSearches } from "../github/retrieval.js";

interface CodeItem {
  path: string;
  html_url: string;
}

export const githubCode: Source = {
  id: "github-code",
  enabledByDefault: true,
  async search(ctx) {
    // Prefer distinctive identifiers for code search; fall back to the OR union.
    const signal = highSignalTerms(ctx.keys);
    const base = `repo:${ctx.client.owner}/${ctx.client.repo}`;
    const queries =
      signal.length > 0
        ? signal.map((t) => `${base} ${t}`)
        : keyTerms(ctx.keys)
          ? [`${base} ${keyTerms(ctx.keys)}`]
          : [];
    if (ctx.dryRun) {
      for (const q of queries) ctx.log(`[github-code] ${q}`);
      return { matches: [] };
    }
    if (queries.length === 0) return { matches: [] };
    // NOTE: GitHub's `search/code` REST endpoint is deprecated and scheduled for
    // removal (~2026-09-27). This source will need to migrate to the GraphQL
    // search API (or another code-search mechanism) before then.
    const budget = ctx.budget ?? makeBudget();
    const { items, truncated } = await runSearches<CodeItem>(
      queries,
      (q, page) => ctx.client.octokit.rest.search.code({ q, per_page: 100, page }),
      (it) => it.path,
      { budget },
    );
    const matches = items.map((it): RawMatch => ({
      sourceId: "github-code",
      id: it.path,
      url: it.html_url,
      title: `code: ${it.path}`,
      filePath: it.path,
    }));
    if (truncated) {
      ctx.log(`[github-code] result set was truncated (rate/page/budget limit).`);
    }
    return { matches };
  },
};
```

- [ ] **Step 6: Decrement the budget in `src/sources/githubReleases.ts`**

Add the retrieval import and a budget decrement before the `listReleases` call:
```ts
import { makeBudget } from "../github/retrieval.js";
```
Inside `search`, before the `listReleases` call (after the dryRun guard):
```ts
    const budget = ctx.budget ?? makeBudget();
    if (budget.remaining <= 0) {
      ctx.log(`[github-releases] skipped (request budget exhausted).`);
      return { matches: [] };
    }
    budget.remaining -= 1;
```
(Keep the rest of the source — the client-side term filter and the existing per-page/log logic — unchanged.)

- [ ] **Step 7: Run the releases/code tests**

Run: `npx vitest run test/github-releases-code.test.ts`
Expected: PASS. (The existing tests pass a `SearchContext` without `budget`; the `?? makeBudget()` fallback keeps them working.)

- [ ] **Step 8: Full suite + format + lint**

Run: `npx vitest run` → all green.
Run: `npm run format && npm run lint` → green.

- [ ] **Step 9: Commit**

```bash
git add src/sources/githubCommits.ts src/sources/githubCode.ts src/sources/githubReleases.ts test/github-commits.test.ts
git commit -m "feat: per-term retrieval for commit and code sources; release budget"
```

---

### Task 7: Verdict rank extraction + benchmark metrics

**Files:**
- Create: `src/verdict.ts`, `benchmark/metrics.ts`
- Modify: `src/cli.ts` (import `verdictRank` from `./verdict.js`)
- Test: `test/verdict.test.ts`, `test/bench-metrics.test.ts`

**Interfaces:**
- Produces:
  - `src/verdict.ts`: `VERDICT_RANK: Record<VerdictLabel, number>`, `verdictRank(label: VerdictLabel): number`
  - `benchmark/metrics.ts`: `recallAtK(matches: { id: string }[], knownIds: string[], k: number): number`, `verdictMeets(actual: VerdictLabel, min: VerdictLabel): boolean`
- Consumes in cli.ts: `verdictRank` (replacing the local RANK/verdictRank).

- [ ] **Step 1: Write `test/verdict.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { verdictRank, VERDICT_RANK } from "../src/verdict.js";

describe("verdictRank", () => {
  it("orders NOVEL lowest and DUPLICATE highest", () => {
    expect(verdictRank("NOVEL")).toBe(0);
    expect(verdictRank("DUPLICATE")).toBe(4);
    expect(VERDICT_RANK["PARTIAL-OVERLAP"]).toBeLessThan(VERDICT_RANK["KNOWN-ISSUE"]);
  });
});
```

- [ ] **Step 2: Write `test/bench-metrics.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { recallAtK, verdictMeets } from "../benchmark/metrics.js";

describe("recallAtK", () => {
  const matches = [{ id: "#1" }, { id: "#2" }, { id: "#3" }, { id: "#4" }];
  it("is 1 when all known ids are within top k", () => {
    expect(recallAtK(matches, ["#2", "#3"], 3)).toBe(1);
  });
  it("is fractional when some known ids fall outside top k", () => {
    expect(recallAtK(matches, ["#2", "#4"], 2)).toBe(0.5);
  });
  it("is 1 (vacuous) when there are no known ids", () => {
    expect(recallAtK(matches, [], 3)).toBe(1);
  });
});

describe("verdictMeets", () => {
  it("passes when actual meets or exceeds the minimum", () => {
    expect(verdictMeets("DUPLICATE", "PARTIAL-OVERLAP")).toBe(true);
    expect(verdictMeets("NOVEL", "NOVEL")).toBe(true);
    expect(verdictMeets("PARTIAL-OVERLAP", "DUPLICATE")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/verdict.test.ts test/bench-metrics.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Write `src/verdict.ts`**

```ts
import type { VerdictLabel } from "./types.js";

export const VERDICT_RANK: Record<VerdictLabel, number> = {
  NOVEL: 0,
  "PARTIAL-OVERLAP": 1,
  "SILENTLY-FIXED": 2,
  "KNOWN-ISSUE": 3,
  DUPLICATE: 4,
};

export function verdictRank(label: VerdictLabel): number {
  return VERDICT_RANK[label];
}
```

- [ ] **Step 5: Update `src/cli.ts` to use `./verdict.js`**

Remove the local `RANK` constant and local `verdictRank` definition; instead import and re-export:
```ts
import { VERDICT_RANK, verdictRank } from "./verdict.js";
export { verdictRank };
```
Replace remaining references to the old local `RANK` with `VERDICT_RANK` (e.g. in the `--fail-on` validation and exit logic). Keep behavior identical.

- [ ] **Step 6: Write `benchmark/metrics.ts`**

```ts
import { verdictRank } from "../src/verdict.js";
import type { VerdictLabel } from "../src/types.js";

export function recallAtK(matches: { id: string }[], knownIds: string[], k: number): number {
  if (knownIds.length === 0) return 1;
  const topIds = new Set(matches.slice(0, k).map((m) => m.id));
  const found = knownIds.filter((id) => topIds.has(id)).length;
  return found / knownIds.length;
}

export function verdictMeets(actual: VerdictLabel, min: VerdictLabel): boolean {
  return verdictRank(actual) >= verdictRank(min);
}
```

- [ ] **Step 7: Run tests + suite**

Run: `npx vitest run test/verdict.test.ts test/bench-metrics.test.ts test/cli.test.ts`
Expected: PASS (cli tests still green after the refactor).

- [ ] **Step 8: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/verdict.ts src/cli.ts benchmark/metrics.ts test/verdict.test.ts test/bench-metrics.test.ts
git commit -m "refactor: extract verdictRank; add benchmark metrics"
```

---

### Task 8: Record/replay GitHub client + toolchain

**Files:**
- Create: `benchmark/replayClient.ts`, `vitest.config.ts`
- Modify: `package.json` (add `tsx` dev dep + `bench`/`bench:live` scripts)
- Test: `test/replay-client.test.ts`

**Interfaces:**
- Consumes: `GithubClient` (client.js), `createGithubClient`.
- Produces:
  - `type Fixture = { calls: Record<string, FixtureEntry> }`, `FixtureEntry = { ok: true; data: unknown } | { ok: false; status: number; message: string }`
  - `callKey(method: string, params: Record<string, unknown>): string`
  - `replayFactory(fixture: Fixture): (repo: string, token?: string) => GithubClient`
  - `recordFactory(fixture: Fixture, token?: string): (repo: string, token?: string) => GithubClient` (wraps a real client, mutates `fixture.calls`)

- [ ] **Step 1: Install `tsx` and add scripts**

Run: `npm install -D tsx@^4.0.0`
Then add to `package.json` `scripts`:
```json
    "bench": "tsx benchmark/run.ts",
    "bench:live": "tsx benchmark/run.ts --live"
```

- [ ] **Step 2: Write `vitest.config.ts` (scope default runs to `test/`)**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```
(This keeps `npm test` running only unit tests, not benchmark files.)

- [ ] **Step 3: Write `test/replay-client.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { callKey, replayFactory, type Fixture } from "../benchmark/replayClient.js";

describe("callKey", () => {
  it("is stable regardless of param key order", () => {
    expect(callKey("search.issuesAndPullRequests", { q: "x", page: 1 })).toBe(
      callKey("search.issuesAndPullRequests", { page: 1, q: "x" }),
    );
  });
});

describe("replayFactory", () => {
  it("returns recorded data and throws recorded errors", async () => {
    const fixture: Fixture = {
      calls: {
        [callKey("search.issuesAndPullRequests", { q: "x", per_page: 100, page: 1 })]: {
          ok: true,
          data: { items: [{ number: 7 }], total_count: 1 },
        },
        [callKey("repos.getContent", { owner: "a", repo: "b", path: "audits" })]: {
          ok: false,
          status: 404,
          message: "Not Found",
        },
      },
    };
    const client = replayFactory(fixture)("a/b");
    const ok = await client.octokit.rest.search.issuesAndPullRequests({
      q: "x",
      per_page: 100,
      page: 1,
    });
    expect((ok.data.items as { number: number }[])[0].number).toBe(7);
    await expect(
      client.octokit.rest.repos.getContent({ owner: "a", repo: "b", path: "audits" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws on an unrecorded call (incomplete fixture)", async () => {
    const client = replayFactory({ calls: {} })("a/b");
    await expect(
      client.octokit.rest.search.commits({ q: "z", per_page: 100, page: 1 }),
    ).rejects.toThrow(/no recorded response/i);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run test/replay-client.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 5: Write `benchmark/replayClient.ts`**

```ts
import { createGithubClient, type GithubClient } from "../src/github/client.js";

export type FixtureEntry =
  | { ok: true; data: unknown }
  | { ok: false; status: number; message: string };

export interface Fixture {
  calls: Record<string, FixtureEntry>;
}

export function callKey(method: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});
  return `${method}::${JSON.stringify(sorted)}`;
}

// The octokit methods the sources call. Each is (params) => Promise<{ data }>.
const METHODS = [
  "search.issuesAndPullRequests",
  "search.commits",
  "search.code",
  "repos.listReleases",
  "repos.compareCommitsWithBasehead",
  "repos.getContent",
] as const;
type Method = (typeof METHODS)[number];

function setPath(root: Record<string, unknown>, dotted: string, fn: unknown): void {
  const [a, b] = dotted.split(".");
  const ns = (root[a] as Record<string, unknown>) ?? {};
  ns[b] = fn;
  root[a] = ns;
}

function fakeOctokit(handler: (m: Method, params: Record<string, unknown>) => Promise<unknown>) {
  const rest: Record<string, unknown> = {};
  for (const m of METHODS) {
    setPath(rest, m, (params: Record<string, unknown> = {}) => handler(m, params));
  }
  return { rest } as unknown as GithubClient["octokit"];
}

export function replayFactory(fixture: Fixture): (repo: string, token?: string) => GithubClient {
  return (repo) => {
    const [owner, name] = repo.split("/");
    const octokit = fakeOctokit(async (m, params) => {
      const key = callKey(m, params);
      const entry = fixture.calls[key];
      if (!entry) throw new Error(`replay: no recorded response for ${key}`);
      if (!entry.ok) {
        throw Object.assign(new Error(entry.message), { status: entry.status });
      }
      return { data: entry.data };
    });
    return { octokit, owner, repo: name };
  };
}

export function recordFactory(
  fixture: Fixture,
  token?: string,
): (repo: string, token?: string) => GithubClient {
  return (repo) => {
    const real = createGithubClient(repo, token);
    const octokit = fakeOctokit(async (m, params) => {
      const key = callKey(m, params);
      const [a, b] = m.split(".");
      const nsAny = (real.octokit.rest as unknown as Record<string, Record<string, unknown>>)[a];
      const method = nsAny[b] as (p: unknown) => Promise<{ data: unknown }>;
      try {
        const res = await method(params);
        fixture.calls[key] = { ok: true, data: res.data };
        return { data: res.data };
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500;
        fixture.calls[key] = { ok: false, status, message: (err as Error).message };
        throw err;
      }
    });
    return { octokit, owner: real.owner, repo: real.repo };
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/replay-client.test.ts`
Expected: PASS.

- [ ] **Step 7: Format, lint, commit**

```bash
npm run format
npm run lint
git add package.json package-lock.json vitest.config.ts benchmark/replayClient.ts test/replay-client.test.ts
git commit -m "feat: record/replay GitHub client and benchmark toolchain"
```

---

### Task 9: Benchmark cases, fixtures, runner + calibration

**Files:**
- Create: `benchmark/cases/hedera-notification-override.json`, `benchmark/cases/hedera-clear-notification.json`, `benchmark/cases/novel-negative.json`, `benchmark/thresholds.json`, `benchmark/run.ts`, and recorded `benchmark/fixtures/*.json`
- Test: none new (the benchmark IS the integration/regression gate)

**Interfaces:**
- Consumes: `run` (engine.js), `replayFactory`/`recordFactory` (replayClient.js), `recallAtK`/`verdictMeets` (metrics.js).
- Produces: `npm run bench` (replay, deterministic) exits 0 when metrics meet `thresholds.json`; `npm run bench:live` re-records fixtures.

- [ ] **Step 1: Write the three case files**

`benchmark/cases/hedera-notification-override.json`:
```json
{
  "name": "hedera-notification-override",
  "repo": "hashgraph/hedera-transaction-tool",
  "finding": {
    "title": "Signer misses pending multi-sig transaction when notification is overwritten",
    "description": "When a transaction requires multiple signatures, if other signers act before a required signer has seen it, the lifecycle status change deletes and replaces that signer's pending notification. The signer is never alerted that a transaction is waiting for their signature (WAITING_FOR_SIGNATURES).",
    "keys": ["notification", "signature", "indicator", "lifecycle", "overriding"],
    "bugClass": "business-logic"
  },
  "expect": { "knownItemIds": ["#2264"], "minVerdict": "PARTIAL-OVERLAP", "topK": 10 }
}
```

`benchmark/cases/hedera-clear-notification.json`:
```json
{
  "name": "hedera-clear-notification",
  "repo": "hashgraph/hedera-transaction-tool",
  "finding": {
    "title": "Signing from Ready-to-sign tab does not clear the new-transaction notification",
    "description": "After a user signs a transaction from the Ready to Sign tab, the 'new transaction ready to sign' notification is not cleared, so the notification persists incorrectly.",
    "keys": ["notification", "sign", "clear", "ready"],
    "bugClass": "business-logic"
  },
  "expect": { "knownItemIds": ["#2319"], "minVerdict": "PARTIAL-OVERLAP", "topK": 10 }
}
```

`benchmark/cases/novel-negative.json`:
```json
{
  "name": "novel-negative",
  "repo": "hashgraph/hedera-transaction-tool",
  "finding": {
    "title": "Flux capacitor desynchronizes the tachyon buffer during warp initialization",
    "description": "A nonsense finding with no real counterpart, used as a true-negative to ensure unrelated findings score NOVEL.",
    "keys": ["fluxcapacitor", "tachyonbuffer"],
    "bugClass": "nonsense"
  },
  "expect": { "knownItemIds": [], "minVerdict": "NOVEL", "topK": 10 }
}
```

- [ ] **Step 2: Write `benchmark/thresholds.json`**

```json
{ "minRecallAtK": 1.0, "minVerdictAccuracy": 1.0 }
```

- [ ] **Step 3: Write `benchmark/run.ts`**

```ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run } from "../src/engine.js";
import type { Finding, VerdictLabel } from "../src/types.js";
import { recallAtK, verdictMeets } from "./metrics.js";
import { replayFactory, recordFactory, type Fixture } from "./replayClient.js";

interface Case {
  name: string;
  repo: string;
  finding: Finding;
  expect: { knownItemIds: string[]; minVerdict: VerdictLabel; topK: number };
}

const here = dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes("--live");
const casesDir = join(here, "cases");
const fixturesDir = join(here, "fixtures");
if (!existsSync(fixturesDir)) mkdirSync(fixturesDir, { recursive: true });

const cases: Case[] = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")) as Case);

const thresholds = JSON.parse(readFileSync(join(here, "thresholds.json"), "utf8")) as {
  minRecallAtK: number;
  minVerdictAccuracy: number;
};

let recallSum = 0;
let verdictHits = 0;
const rows: string[] = [];

for (const c of cases) {
  const fixturePath = join(fixturesDir, `${c.name}.json`);
  const fixture: Fixture =
    !live && existsSync(fixturePath)
      ? (JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture)
      : { calls: {} };

  const clientFactory = live
    ? recordFactory(fixture)
    : replayFactory(fixture);

  const verdict = await run({ repo: c.repo, finding: c.finding, clientFactory });

  if (live) writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

  const recall = recallAtK(verdict.matches, c.expect.knownItemIds, c.expect.topK);
  const verdictOk = verdictMeets(verdict.label, c.expect.minVerdict);
  recallSum += recall;
  verdictHits += verdictOk ? 1 : 0;
  rows.push(
    `${c.name.padEnd(32)} recall@${c.expect.topK}=${recall.toFixed(2)}  ` +
      `verdict=${verdict.label} (need >=${c.expect.minVerdict}) ${verdictOk ? "OK" : "FAIL"}`,
  );
}

const avgRecall = recallSum / cases.length;
const verdictAcc = verdictHits / cases.length;

// eslint-disable-next-line no-console
console.log(
  ["Dup-Scout benchmark", ...rows, "", `Recall@K avg: ${avgRecall.toFixed(2)}`, `Verdict accuracy: ${verdictAcc.toFixed(2)}`].join(
    "\n",
  ),
);

if (avgRecall < thresholds.minRecallAtK || verdictAcc < thresholds.minVerdictAccuracy) {
  // eslint-disable-next-line no-console
  console.error(
    `benchmark regression: recall ${avgRecall.toFixed(2)} (>= ${thresholds.minRecallAtK}) / ` +
      `verdict ${verdictAcc.toFixed(2)} (>= ${thresholds.minVerdictAccuracy})`,
  );
  process.exit(1);
}
```

- [ ] **Step 4: Record fixtures against live GitHub**

`gh` is authenticated on this machine. Record:
```bash
export GITHUB_TOKEN="$(gh auth token)"
npm run build
npm run bench:live
```
Expected: `benchmark/fixtures/*.json` written for all three cases; the run prints per-case metrics.

- [ ] **Step 5: Calibrate if any case fails**

Inspect the printed table. Expected outcomes:
- `hedera-notification-override` → `#2264` within top 10, verdict ≥ PARTIAL-OVERLAP.
- `hedera-clear-notification` → `#2319` within top 10, verdict ≥ PARTIAL-OVERLAP.
- `novel-negative` → NOVEL (recall vacuously 1).

If a real case narrowly misses its `minVerdict` because of threshold tuning, adjust `THRESHOLDS` in `src/score.ts` (only the `partial`/`report` numbers, in small increments), re-run `npm run build && npm run bench` (replay, no re-record needed), and re-check. Do NOT lower a threshold below the point where `novel-negative` stops being NOVEL. Record the final threshold values in the report. If a *known item id* is not retrieved at all (recall 0), that is a retrieval bug — investigate the queries with `--dry-run` rather than moving thresholds.

- [ ] **Step 6: Verify the deterministic replay run is green**

Run: `npm run bench`
Expected: exit 0; metrics meet thresholds; no network (fixtures replayed).

- [ ] **Step 7: Format, lint, commit (fixtures included)**

```bash
npm run format
npm run lint
git add benchmark/cases benchmark/fixtures benchmark/thresholds.json benchmark/run.ts src/score.ts
git commit -m "feat: benchmark cases, recorded fixtures, runner, and calibration"
```

---

### Task 10: CI job, docs, and 1.0.0

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `package.json` (version)
- Test: manual (CI file is config; docs)

**Interfaces:**
- Consumes: the finished `npm run bench`.

- [ ] **Step 1: Add a `bench` job to `.github/workflows/ci.yml`**

Add this job alongside the existing `build` job (same `jobs:` map):
```yaml
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run bench
```

- [ ] **Step 2: Bump version to 1.0.0**

In `package.json`, set `"version": "1.0.0"`.

- [ ] **Step 3: Update `CHANGELOG.md`**

Replace the `## Unreleased` heading section by promoting it, and add the v1.0 items:
```markdown
## 1.0.0

- **Per-term merged retrieval**: each GitHub search source now issues one scoped
  query per high-signal term (plus a broad OR query) and merges/dedups results,
  so the exact prior-art item surfaces even when GitHub's relevance ranking
  buries it in a broad query. Bounded by a per-run request budget with octokit
  throttling/retry; truncation is logged, never silent.
- **High-signal key extraction**: recognizes enums (`SCREAMING_SNAKE`), selectors
  (`0x…`), PascalCase error/type names, and camelCase/`_snake` identifiers, and
  weights them highest so queries and scoring key off the distinctive strings.
- **Benchmark harness**: a deterministic recorded-fixture benchmark
  (`npm run bench`) measures Recall@K and verdict accuracy against labeled cases
  and gates regressions in CI; `npm run bench:live` refreshes fixtures.
- Earlier scoring/recall tuning from the v0.1 line is folded in.
```
(Delete the prior `## Unreleased` block's content that this supersedes; keep the historical `## 0.1.0` entry.)

- [ ] **Step 4: Document the benchmark in `README.md`**

Add a short section after "Agent integration":
```markdown
## Benchmark

Dup-Scout ships a deterministic benchmark that proves recall + verdict quality:

```bash
npm run bench        # replay recorded fixtures, compute Recall@K + verdict accuracy (CI gate)
npm run bench:live   # re-fetch from GitHub and refresh fixtures (needs a token)
```

Cases live in `benchmark/cases/`, recorded responses in `benchmark/fixtures/`,
and metric floors in `benchmark/thresholds.json`.
```

- [ ] **Step 5: Final green check**

Run: `npm test` → all unit tests pass.
Run: `npm run lint` → green.
Run: `npm run build` → green.
Run: `npm run bench` → exit 0, metrics meet thresholds.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md CHANGELOG.md package.json
git commit -m "ci: benchmark gate; docs; release 1.0.0"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2 per-term merged retrieval | 3, 5, 6 |
| §2 pagination + budget + truncation logging | 1, 5, 6 |
| §2 octokit throttling/retry | 2 |
| §2 shared retrieval helpers (searchPaged/mergeById/runSearches/RetrievalBudget) | 1 |
| §2 SearchContext.budget | 1, 2 |
| §3 high-signal key extraction (selectors/enums/errors/identifiers) | 4 |
| §3 distinctive-first term ordering | 3 |
| §4.1 labeled cases | 9 |
| §4.2 recorded fixtures + replay transport + clientFactory DI | 2 (DI), 8 (replay), 9 (fixtures) |
| §4.3 runner + Recall@K + verdict accuracy + regression gate | 7 (metrics), 9 (runner) |
| §4.4 calibration | 9 |
| §4.5 CI bench job | 10 |
| §5 repo additions | matches File Structure |
| §6 testing (unit + benchmark gate) | every task + 9 |
| §7 version 1.0.0 | 10 |

No spec section is left without a task.

**2. Placeholder scan:** No "TBD"/"add error handling" placeholders; every code step contains complete code. Task 9's calibration is bounded with explicit rules (adjust only partial/report thresholds in small increments; never below the novel-negative floor; recall-0 is a retrieval bug, not a threshold issue) rather than open-ended tuning. The two extra cases mentioned in the spec ("~5") are intentionally reduced to three concrete, deterministically-recordable cases (two positive real, one true-negative) — a conscious scope decision, not a gap; more can be added later by dropping a case file + re-recording.

**3. Type consistency:** `RetrievalBudget`/`makeBudget`/`searchPaged`/`runSearches`/`mergeById` defined in Task 1 and consumed unchanged in Tasks 5–6; `queriesFor`/`highSignalTerms` defined in Task 3 and consumed in 5–6; `clientFactory`/`GithubClient` from Task 2 consumed by the benchmark in 8–9; `verdictRank`/`VERDICT_RANK` defined in Task 7 (`src/verdict.ts`) and consumed by cli.ts + metrics.ts; `Fixture`/`callKey`/`replayFactory`/`recordFactory` from Task 8 consumed by the runner in Task 9; `recallAtK`/`verdictMeets` from Task 7 consumed in Task 9. Source ids and `SearchContext` shape unchanged except the additive `budget`.
