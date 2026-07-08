# Changelog

## 1.0.1

- Added `monero-oxide/monero-oxide` benchmark cases for `monero-daemon-rpc`
  contiguous block retrieval and `SimpleRequestTransport` debug credential
  leakage. The negative fixture now uses the same repo.

## 1.0.0

- Per-term retrieval: each GitHub search source now runs one scoped query per
  high-signal term, plus a broad OR query, then merges and deduplicates results.
  This helps exact prior-art items surface even when GitHub ranks them low in a
  broad query. A per-run request budget bounds the work, and truncation is
  logged.
- High-signal key extraction: recognizes enums (`SCREAMING_SNAKE`), selectors
  (`0x...`), PascalCase error/type names, and camelCase or `_snake` identifiers.
  These terms carry the most weight in queries and scoring.
- Benchmark harness: `npm run bench` replays recorded fixtures and measures
  Recall@K plus verdict accuracy against labeled cases. CI runs it as a
  regression check. `npm run bench:live` refreshes fixtures from GitHub.
- Earlier scoring/recall tuning from the v0.1 line is folded in.

## 0.1.0

- Initial release: engine, GitHub PR/issue/commit/release/code sources,
  web3 audit-report and guided contest sources, terminal/json/markdown
  reporters, the `dup-scout` CLI with CI-friendly exit codes, and a
  `dup-scout install` subcommand that registers a `/dup-scout` slash command
  in Claude Code and Codex.
