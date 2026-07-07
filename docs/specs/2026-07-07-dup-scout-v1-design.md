# Dup-Scout v1.0 — Design Spec ("provably good")

**Date:** 2026-07-07
**Status:** Approved (brainstorming), pre-implementation
**Builds on:** v0.1 (shipped) — engine, sources, scoring, CLI, install, docs/CI.

---

## 1. Problem & Goal

v0.1 works but a real benchmark (hashgraph/hedera-transaction-tool) exposed the
core weakness: a single OR-union GitHub query defers to GitHub's own relevance
ranking, which **buries the exact matching PR** (PR #2307 was not in the top 100
of 253 results). Duplicate detection lives or dies on recall, and today's recall
is unprovable.

v1.0 makes Dup-Scout **provably good** along three axes:

1. **Retrieval overhaul** — find the exact prior-art item regardless of GitHub
   ranking, at bounded cost.
2. **High-signal key extraction** — recognize distinctive tokens so queries and
   scoring both key off the rare, identifying strings.
3. **Verdict calibration + benchmark harness** — a repeatable, deterministic
   benchmark (Recall@K + verdict accuracy) that proves the tool works and gates
   regressions in CI.

### Non-goals (YAGNI, deferred to v1.1+)
- Semantic / embeddings matching.
- Real contest-platform scraping (Code4rena/Sherlock/Cantina/Immunefi stay
  *guided* URL emitters).
- Migrating `github-code` off the deprecated `search/code` endpoint (runway to
  ~2026-09-27).

### Version
Ship as **1.0.0**.

---

## 2. Workstream 1 — Retrieval overhaul (recall)

### Approach: per-term merged retrieval
Each GitHub **search** source (`github-prs`, `github-issues`, `github-commits`,
`github-code`) changes from "one OR-union query" to:

1. Take the top **N=6** high-signal terms (kind-ordered, from Workstream 2).
2. Issue **one scoped search per term** (`repo:… type:pr <term>`), fetching up to
   **P=2** pages (`per_page=100`).
3. Issue **one broad OR-union query** (the current behavior) for coverage.
4. **Merge all results, dedup by id** (keep first/highest-ranked occurrence).

A term GitHub buries in the OR-union surfaces on its own dedicated query, so the
exact PR/issue is retrieved even when the union ranks it past the fetch window.

### Robustness (folded in — per-term multiplies request count)
- `GithubClient`'s Octokit instance gains `@octokit/plugin-throttling` and
  `@octokit/plugin-retry`:
  - throttling: automatic wait/retry on primary rate limit (search = 30
    req/min authenticated) and secondary/abuse limits, with a small
    bounded retry count.
  - retry: automatic retry on transient 5xx.
- A **hard per-run search-request budget** (default **40**) is enforced by a
  shared counter in the retrieval helper; when exhausted, remaining queries are
  skipped and a note/log records it (**never silent**).
- Requests run with small bounded concurrency (throttling plugin serializes as
  needed).

### Shared helpers (new)
- `src/github/retrieval.ts`:
  - `searchPaged(client, method, params, { maxPages, budget }): Promise<{ items, total, truncated }>`
    — paginates a search method up to `maxPages`, respecting a shared `budget`
    counter; reports `truncated` when `total` exceeds what was fetched or budget
    hit.
  - `mergeById<T>(groups: T[][], idOf: (t) => string): T[]` — flatten + dedup.
- `RetrievalBudget` — a tiny mutable `{ remaining: number }` created per `run()`
  and shared across sources so the 40-call cap is global, not per-source.

### Interface impact
Contained: each source's `search()` gains the per-term loop + merge; the engine
creates one `RetrievalBudget` and passes it via `SearchContext.budget`. Registry,
reporters, CLI unchanged. `SearchContext` gains `budget?: RetrievalBudget`.

### New dependencies
`@octokit/plugin-throttling`, `@octokit/plugin-retry` (official, small).

---

## 3. Workstream 2 — High-signal key extraction

`extractKeys` learns distinctive-token detection. New/updated classification
(highest weight wins on dedup):

| Pattern | Example | kind | weight |
|---|---|---|---|
| `0x` + 8+ hex | `0xa9059cbb` | selector | 6 |
| `SCREAMING_SNAKE_CASE` (≥2 segments) | `WAITING_FOR_SIGNATURES` | selector | 6 |
| PascalCase ≥2 humps (error/type-ish) | `InsufficientBalance` | error | 6 |
| camelCase / `_lower` identifier | `clearNewIndicatorForUser`, `_settle` | function | 5 |
| explicit `--function` | | function | 5 |
| `--file` + basename | `src/Vault.sol` → `Vault` | file/contract | 4 |
| `--keys` entries | | invariant | 4 |
| `--bug-class` | | pattern | 3 |
| other ≥4-char words | | generic | 1 |

- Detection runs over `title + description` (and the explicit fields).
- Distinctive kinds (selector/error/function) outrank invariant/pattern in
  `keyTerms` ordering (already implemented) → per-term retrieval fires the rare
  enum/error first, and `scoreMatch` (signal/generic split, already implemented)
  rewards the distinctive hit.
- Stopword and length gating unchanged; dedup keeps the highest-weight kind for a
  repeated term.

Interface impact: `src/keys.ts` internals only. No type changes (kinds already
exist in `KeyKind`).

---

## 4. Workstream 3 — Verdict calibration + benchmark harness

### 4.1 Labeled cases
`benchmark/cases/*.json`, each:
```json
{
  "name": "hedera-notification-override",
  "repo": "hashgraph/hedera-transaction-tool",
  "finding": { "title": "...", "description": "...", "keys": ["..."], "bugClass": "..." },
  "expect": { "knownItemIds": ["#2264"], "minVerdict": "PARTIAL-OVERLAP", "topK": 10 }
}
```
Minimum ~5 cases:
- **hedera-notification-override** — surfaces #2264 in topK, verdict ≥ PARTIAL-OVERLAP.
- **a known-fixed-bug case** (a repo where a bug was fixed in a merged PR) —
  expect DUPLICATE or SILENTLY-FIXED.
- **a genuinely-novel / absurd finding** — expect NOVEL (true negative; guards
  against everything scoring high).
- Two more real cases across different repos for breadth.

`minVerdict` uses the verdict rank order (NOVEL < PARTIAL-OVERLAP <
SILENTLY-FIXED < KNOWN-ISSUE < DUPLICATE); "meets or exceeds" passes.

### 4.2 Recorded fixtures + replay transport
- **Injection point:** add `RunOptions.clientFactory?: (repo, token) => GithubClient`
  (default = `createGithubClient`). The benchmark injects a client whose Octokit
  uses a **replay `fetch`**.
- `benchmark/replayTransport.ts`:
  - **replay mode**: a `fetch`-shaped function that matches an incoming request
    (method + normalized URL + body) against `benchmark/fixtures/<case>.json`
    and returns the recorded response; a miss is a hard error (fixtures
    incomplete).
  - **record mode** (`--live`): wraps the real `fetch`, performs the request,
    writes the response into the fixture file, and returns it.
- Fixtures are committed → the benchmark is **deterministic and network-free** in
  CI.

### 4.3 Runner + metrics
`benchmark/run.ts` (invoked via `npm run bench`, and `npm run bench:live` for
refresh):
- Loads all cases, runs `run()` against the replay client.
- Per case computes:
  - **Recall@K**: did every `knownItemIds` appear within the top-`topK` ranked
    matches? (boolean / fraction)
  - **Verdict accuracy**: `verdictRank(actual) >= verdictRank(minVerdict)`.
- Prints a per-case + aggregate table (Recall@K %, verdict-accuracy %).
- **Exit non-zero** if aggregate metrics fall below a committed threshold
  (regression gate). Thresholds stored in `benchmark/thresholds.json`.

### 4.4 Calibration
Tune `THRESHOLDS` (score.ts) and any scoring weights against the benchmark until
all labeled cases pass their `expect`. The benchmark's committed thresholds then
lock the calibration in place.

### 4.5 CI
Add a `bench` job to `.github/workflows/ci.yml` running `npm run bench` (replay,
no network) after tests.

---

## 5. Repository additions

```
src/github/retrieval.ts        # searchPaged, mergeById, RetrievalBudget
benchmark/
  cases/*.json                 # labeled findings + expectations
  fixtures/*.json              # recorded GitHub responses (committed)
  replayTransport.ts           # record/replay fetch
  run.ts                       # runner + metrics + regression gate
  thresholds.json              # committed metric floors
```
Modified: `src/keys.ts`, `src/github/client.ts` (plugins + optional fetch),
`src/engine.ts` (clientFactory DI + RetrievalBudget), `src/types.ts`
(`SearchContext.budget`), the four search sources, `package.json` (deps +
scripts), `.github/workflows/ci.yml`, `CHANGELOG.md`, `README.md`.

---

## 6. Testing

- **Unit:** new key-kind classification (`keys.test.ts`); `searchPaged` pagination
  + budget exhaustion + `mergeById` dedup (mocked octokit, multi-page fixtures);
  metrics computation (`recallAtK`, verdict-accuracy) on synthetic verdicts.
- **Source tests:** updated for per-term loop + dedup (mocked octokit), asserting
  a term-buried item is retrieved via its dedicated query.
- **Benchmark:** the deterministic replay run is the integration + regression
  gate; must pass in CI.
- **Definition of done:** `npm test`, `npm run lint`, `npm run build`, and
  `npm run bench` all green; the hedera case surfaces #2264 in topK with verdict
  ≥ PARTIAL-OVERLAP from the *default* (non-tuned) invocation.

---

## 7. Resolved decisions
- Benchmark data: **recorded fixtures + `--live` refresh** (deterministic CI,
  grounded in real data).
- Scope: retrieval + key extraction + calibration/benchmark; contest scraping and
  embeddings deferred.
- Rate limiting: official octokit throttling/retry plugins + a hard per-run
  request budget.
- Version: **1.0.0**.
