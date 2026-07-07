# Dup-Scout — Design Spec

**Date:** 2026-07-07
**Status:** Approved (brainstorming), pre-implementation
**Repo:** standalone, publishable (`Dup-Scout` / npm `dup-scout`)

---

## 1. Problem & Purpose

When auditing source code for bug bounty (web2 and web3), a finding that is
already known — reported in a prior PR/issue, acknowledged in a past audit,
disclosed in a contest, or silently fixed in a later commit — will be marked
**duplicate**, **known-issue**, or **out-of-scope** on submission. That wastes
report-writing effort and hurts the hunter's signal/validity ratio.

**Dup-Scout** is a CLI + library that, given a target's GitHub repo and a
described finding, scans prior art (PRs, issues, commits, releases, and web3
audit sources) and returns a **verdict** estimating whether the finding is
likely to be a duplicate — *before* the report is written.

### Goals
- Point-and-run: `dup-scout <owner/repo> --finding finding.md` → verdict + evidence.
- Cover open **and** closed/merged PRs and issues, commits (incl. silent fixes),
  and releases.
- Pluggable sources so web3-specific prior art (audit reports, Code4rena /
  Sherlock / Cantina / Immunefi known-issues) can be added without touching core.
- CI-friendly (exit codes) and paste-friendly (`--markdown` output).
- Publishable to npm; usable both as a CLI and as an embeddable library.

### Non-goals (YAGNI)
- No GUI / web dashboard.
- No persistent database — each run is stateless.
- No brittle auto-scraping of contest platforms; those sources are *guided*
  (emit candidate URLs, optional fetch).
- No separate web2 vs web3 codepaths — scope is controlled by which source
  modules are enabled.

---

## 2. Tech Stack & Packaging

- **Language:** TypeScript, Node ≥ 18, ESM.
- **Build:** `tsup` → `dist/` (CLI bin + library entry).
- **Test:** `vitest`, with mocked GitHub responses (no live network in CI).
- **Lint/format:** eslint + prettier, `tsconfig` strict.
- **GitHub access:** `@octokit/rest` (+ GraphQL where it reduces calls). Token
  resolution order: `--token` → `GITHUB_TOKEN` / `GH_TOKEN` env → `gh auth token`
  → unauthenticated (reduced rate limit, warned). Central rate-limit + retry
  handling.
- **CLI framework:** `commander` (small, well-understood).
- **Publish:** `package.json` `bin: { "dup-scout": "dist/cli.js" }`, `main` +
  `types` for library use, MIT `LICENSE`, `README.md`, `CHANGELOG.md`,
  `.github/workflows/ci.yml` (lint/test/build on PR) and `release.yml`
  (npm publish on tag `v*`).

---

## 3. Architecture

```
                         ┌──────────────────────────────┐
  Finding (structured) ─▶│ 1. Key extraction            │
                         └──────────────┬───────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │ 2. Source registry (fan-out)  │
                         │   github-prs   github-issues  │
                         │   github-commits  releases    │
                         │   github-code                 │
                         │   web3: audit-reports contests│
                         └──────────────┬───────────────┘
                                        ▼  Match[]
                         ┌──────────────────────────────┐
                         │ 3. Scorer + aggregator        │
                         └──────────────┬───────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │ 4. Verdict + reporter         │
                         │   terminal / json / markdown  │
                         └──────────────────────────────┘
```

### Core units (each independently testable)

| Unit | Responsibility | Depends on |
|---|---|---|
| `Finding` (type) + `parseFinding` | Load a finding from CLI flags, `--finding file.{json,md}` | — |
| `extractKeys` | Derive search keys from a Finding | `Finding` |
| `Source` (interface) | `search(ctx): Promise<Match[]>` contract | types |
| `SourceRegistry` | Register / enable / disable / run sources concurrently | `Source` |
| GitHub client wrapper | Auth resolution, rate-limit, retry, thin query helpers | octokit |
| Each source module | One prior-art surface → `Match[]` | github client / fs / fetch |
| `scoreMatch` / `aggregate` | Per-match score + overall verdict | `Match`, keys |
| `reporters` | terminal / json / markdown renderers | `Verdict` |
| `cli` | Arg parsing → engine → reporter → exit code | all above |

### Key data types (draft)

```ts
interface Finding {
  title: string;
  description: string;
  file?: string;          // e.g. src/Vault.sol
  functions?: string[];   // e.g. ["claim","_settle"]
  keys?: string[];        // manual override / additions
  scopeTag?: string;      // in-scope commit/tag for silent-fix detection
  bugClass?: string;      // optional, e.g. "reentrancy", "IDOR"
}

interface Match {
  sourceId: string;       // "github-prs"
  id: string;             // "#123"
  url: string;
  title: string;
  state?: string;         // open | closed | merged
  snippet?: string;
  matchedKeys: string[];
  score: number;          // 0..100
}

type VerdictLabel =
  | "DUPLICATE" | "KNOWN-ISSUE" | "SILENTLY-FIXED"
  | "PARTIAL-OVERLAP" | "NOVEL";

interface Verdict {
  label: VerdictLabel;
  confidence: number;     // 0..1
  matches: Match[];       // ranked
  notes: string[];        // e.g. off-GitHub sources to check manually
}
```

---

## 4. Sources

### Built-in (GitHub)
- **github-prs** — `search/issues` with `type:pr`, all states incl. **merged**;
  boosts security-signal titles ("fix", "vuln", "security", "audit").
- **github-issues** — open + closed issues.
- **github-commits** — commit message search **and** silent-fix detection:
  when `scopeTag` is set and `file` is known, diff `scopeTag..HEAD` on the
  affected path; a security-relevant change there → `SILENTLY-FIXED` candidate.
- **github-releases** — release/changelog body search.
- **github-code** — code search for function names / selectors (helps locate the
  same sink referenced elsewhere). Optional (respects code-search rate limits).

### Web3 module pack
- **audit-reports** — locate audit artifacts (repo `/audits`, `/docs`,
  README links; `.md`/`.pdf`/`.txt`), full-text search for the keys, surface
  "acknowledged / known / won't-fix" language → `KNOWN-ISSUE`.
- **contests** (*guided*) — Code4rena, Sherlock, Cantina, Immunefi known-issues.
  Emits candidate search URLs for the protocol + keys; optionally fetches and
  scans when a fetch capability is configured. Never fails the run if the
  platform is unreachable — records a `notes[]` reminder instead.

### Extensibility
`SourceRegistry.register(source)` + config toggles let users add custom sources
(e.g. a private tracker) without modifying core. Config file `.dupscout.json`.

---

## 5. Scoring & Verdict

**Key extraction** produces a weighted key set from the finding:
- function/contract/file names (high weight, exact-match boost),
- event / error / modifier names,
- invariant / domain terms ("rounding", "share price", "authority", "slippage",
  "decimals", "reentrancy"),
- optional 4-byte selector, CWE/pattern name,
- de-noised against a stopword list so generic terms don't dominate.

**Per-match score (0–100):** normalized keyword overlap
+ exact-function-name boost + same-file-path boost + security-signal-title boost
+ state boost (merged/closed prior work weighs heavier than a stale open issue).

**Verdict aggregation:**

| Signal | Label |
|---|---|
| High-score match: same function + same root cause in merged PR / closed issue / contest finding | `DUPLICATE` |
| Match in a past audit report with acknowledged/known/won't-fix language | `KNOWN-ISSUE` |
| Security-relevant change on the affected path in `scopeTag..HEAD`, not yet released | `SILENTLY-FIXED` (flag; check program's undeployed-fix + public-disclosure rules) |
| Same bug class, different location/root cause | `PARTIAL-OVERLAP` (argue distinctness explicitly) |
| No qualifying match across enabled sources | `NOVEL` |

Confidence is a function of top-match score and corroborating-source count.
Thresholds are constants in one module (tunable, unit-tested).

---

## 6. CLI UX

```
dup-scout <owner/repo> [options]

Finding input (one of):
  --finding <file.json|file.md>     structured finding
  --title <s> --desc <s>            inline
Optional finding hints:
  --file <path>  --function <name...>  --keys <a,b,c>
  --scope-tag <tag>  --bug-class <s>

Sources & output:
  --sources <ids>        comma list (default: all github + web3)
  --json | --markdown    output format (default: pretty terminal)
  --token <t>            GitHub token override
  --min-score <n>        report threshold
  --dry-run              print queries, do not execute
  --fail-on <label>      exit non-zero at/above this verdict (CI gate)
```

- Default exit `0`; `--fail-on DUPLICATE` (or `KNOWN-ISSUE`) makes it a pipeline gate.
- `--markdown` emits a "## Duplicate check" block (verdict, confidence, evidence
  table) to paste into hunt notes or a report appendix.
- `--dry-run` prints every source's queries for transparency/debugging.

---

## 7. Testing & Verification

- **Unit:** `extractKeys` (key derivation + stopwords), `scoreMatch`,
  `aggregate` (each verdict branch), `parseFinding` (json + md).
- **Source tests:** each GitHub source with **mocked octokit** responses
  (fixtures) — asserts correct query construction and `Match` mapping. No live
  network in CI.
- **CLI test:** arg parsing, format selection, `--fail-on` exit codes,
  `--dry-run` query emission.
- **Manual smoke:** one live run against a chosen public repo to confirm the
  end-to-end path, auth resolution, and rate-limit handling.
- **Definition of done:** `npm run build`, `npm test`, `npm run lint` all green;
  smoke run produces a coherent verdict.

---

## 8. Repository Layout (target)

```
Dup-Scout/
  src/
    cli.ts
    engine.ts
    finding.ts            # Finding type + parseFinding
    keys.ts               # extractKeys
    score.ts              # scoreMatch + aggregate + thresholds
    github/client.ts      # octokit wrapper (auth, rate limit)
    sources/
      index.ts            # SourceRegistry + defaults
      githubPrs.ts
      githubIssues.ts
      githubCommits.ts
      githubReleases.ts
      githubCode.ts
      web3/auditReports.ts
      web3/contests.ts
    reporters/
      terminal.ts  json.ts  markdown.ts
    types.ts
  test/                   # vitest specs + fixtures
  docs/specs/2026-07-07-dup-scout-design.md
  package.json  tsconfig.json  tsup.config.ts
  .eslintrc  .prettierrc  .gitignore
  README.md  CHANGELOG.md  LICENSE
  .github/workflows/ci.yml  release.yml
```

---

## 9. Resolved Decisions

- **npm name:** unscoped `dup-scout`.
- **License:** MIT.
- **`contests` source (v1):** *guided* mode only — emit candidate search URLs +
  expose a pluggable fetch hook. No built-in scraper in v1; real fetching may
  land in a later version.
