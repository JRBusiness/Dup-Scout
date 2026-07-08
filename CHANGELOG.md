# Changelog

## 1.0.1

- added new benchmark target set with `monero-oxide/monero-oxide` cases:
  recorded checks now cover `monero-daemon-rpc` contiguous block retrieval,
  `SimpleRequestTransport` debug credential leakage, and a Monero-Oxide
  true-negative fixture.

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

## 0.1.0

- Initial release: engine, GitHub PR/issue/commit/release/code sources,
  web3 audit-report and guided contest sources, terminal/json/markdown
  reporters, the `dup-scout` CLI with CI-friendly exit codes, and a
  `dup-scout install` subcommand that registers a `/dup-scout` slash command
  in Claude Code and Codex.
