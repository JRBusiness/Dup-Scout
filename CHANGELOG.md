# Changelog

## Unreleased

- Recall & scoring improvements (from real-world benchmarking against
  hashgraph/hedera-transaction-tool):
  - Scoring no longer lets common filler words dilute a strong match on the
    distinctive signal keys — signal-key coverage drives the base score (0..90)
    and generic overlap adds only a small bonus (0..10). Strong same-topic
    matches now clear the PARTIAL-OVERLAP threshold instead of reading as NOVEL.
  - Search snippet window widened (300 → 2000 chars) so key terms deeper in a
    PR/issue body are counted.
  - GitHub search page size raised to the API max (100), and the sources now
    **log** when more results matched than were fetched — no more silent
    truncation.
  - Query terms are ordered by distinctiveness (errors/identifiers/functions
    before common invariant/pattern words) for better precision.

## 0.1.0 (unreleased)

- Initial release: engine, GitHub PR/issue/commit/release/code sources,
  web3 audit-report and guided contest sources, terminal/json/markdown
  reporters, the `dup-scout` CLI with CI-friendly exit codes, and a
  `dup-scout install` subcommand that registers a `/dup-scout` slash command
  in Claude Code and Codex.
