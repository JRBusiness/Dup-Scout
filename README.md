# Dup-Scout

Prior-art / duplicate checker for bug bounty findings. Point it at a target's GitHub repo, describe your finding, and Dup-Scout scans PRs (open/closed/merged), issues, commits (including silent fixes after your in-scope tag), releases, and web3 audit sources to estimate whether the finding will be flagged **duplicate / known-issue / already-fixed** — before you write the report.

## Install

```bash
npm install -g dup-scout
# or run without installing:
npx dup-scout <owner/repo> --title "..." --desc "..."
```

## Auth

Dup-Scout resolves a GitHub token from (in order): `--token`, `GITHUB_TOKEN`, `GH_TOKEN`, then `gh auth token`. Unauthenticated runs work but hit low rate limits. A read-only token is sufficient.

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

# preview the queries without calling GitHub, as JSON
dup-scout acme/vault --title "..." --keys claim,_settle --dry-run --json
```

### Options

| Flag                | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `--title <s>`       | Finding title (required unless `--finding` is used)         |
| `--desc <s>`        | Finding description                                         |
| `--finding <file>`  | Load the finding from a `.json` or `.md` file               |
| `--file <path>`     | Affected source file                                        |
| `--function <name>` | Affected function name(s); repeatable                       |
| `--keys <a,b,c>`    | Extra search keys (comma-separated)                         |
| `--scope-tag <tag>` | In-scope tag for silent-fix detection                       |
| `--bug-class <s>`   | Bug class (e.g. `reentrancy`)                               |
| `--sources <ids>`   | Comma-separated source ids to enable                        |
| `--min-score <n>`   | Minimum match score to report (numeric)                     |
| `--json`            | Output JSON                                                 |
| `--markdown`        | Output a markdown "Duplicate check" block                   |
| `--dry-run`         | Print the queries that would run without calling the API    |
| `--token <t>`       | GitHub token override                                       |
| `--fail-on <label>` | Exit non-zero at/above this verdict (`NOVEL` … `DUPLICATE`) |

Invalid `--fail-on` labels and non-numeric `--min-score` values exit with a non-zero status instead of being silently ignored.

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

| Verdict           | Meaning                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `DUPLICATE`       | Same function + root cause already in a merged PR / closed issue / contest finding       |
| `KNOWN-ISSUE`     | Acknowledged / won't-fix in a past audit report                                          |
| `SILENTLY-FIXED`  | Affected file changed after your in-scope tag (check the program's undeployed-fix rules) |
| `PARTIAL-OVERLAP` | Same bug class, different location — argue distinctness                                  |
| `NOVEL`           | No qualifying prior art found in enabled sources                                         |

## Sources

`github-prs`, `github-issues`, `github-commits`, `github-releases`, `github-code`, `audit-reports`, `contests` (guided). Enable a subset with `--sources github-prs,audit-reports`.

> The `contests` source is _guided_: it emits candidate Code4rena / Sherlock / Cantina / Immunefi search URLs to check manually. Provide a fetch hook via the library API to auto-scan them.

## Agent integration (Claude Code & Codex)

Register a `/dup-scout` slash command inside both agents so you can run a duplicate check without leaving your session:

```bash
dup-scout install --all     # installs into both Claude Code and Codex
dup-scout install           # same as --all when no agent flag is given
dup-scout install --claude  # Claude Code only  (~/.claude/commands/dup-scout.md)
dup-scout install --codex   # Codex only         (~/.codex/prompts/dup-scout.md)
dup-scout install --force   # overwrite existing command files
```

`install` honours `CLAUDE_CONFIG_DIR` and `CODEX_HOME` if set. It never runs on `npm install` — it's an explicit opt-in step. Then, inside either agent:

```
/dup-scout acme/vault reentrancy in claim() lets an attacker drain the vault
```

The command shells out to the `dup-scout` CLI (install it globally first with `npm i -g dup-scout`) and summarizes the verdict.

## Library use

```ts
import { run } from "dup-scout";
const verdict = await run({ repo: "acme/vault", finding: { title: "...", description: "..." } });
```

## Caveats

Dup-Scout estimates duplicate likelihood; it is not a substitute for reading the program's scope, known-issues list, and prior-audit clause.
Always confirm matches by hand before deciding not to submit.

## Releasing to npm

This repo publishes from GitHub Actions using npm trusted publishing, so no long-lived `NPM_TOKEN` secret is required.

Before the first release, create or claim the package on npm and configure trusted publishing:

1. In npm, open the `dup-scout` package settings and add a GitHub Actions trusted publisher.
2. Use GitHub owner/user `JRBusiness`, repository `Dup-Scout`, and workflow filename `release.yml`.
3. Allow `npm publish`. Leave the environment name blank unless you also add a matching GitHub environment to the workflow.

To cut a release:

```bash
npm version patch
git push origin main --follow-tags
```

Use `minor` or `major` instead of `patch` when appropriate. The pushed `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which runs lint, tests, build, a dry-run package check, verifies the tag matches `package.json`, and publishes to npm.

For a local preflight without publishing:

```bash
npm run lint
npm test
npm run pack:check
```

## License

MIT
