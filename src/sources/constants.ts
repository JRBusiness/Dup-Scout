// Shared tuning constants for the GitHub-backed sources.

// Characters of an item's body kept for keyword scoring. The old 300 was too
// short — key terms often appear deeper in a PR/issue body, so matches were
// undercounted. Large enough to catch them, bounded to keep scoring cheap.
export const SNIPPET_LEN = 2000;

// Page size for GitHub search calls. GitHub's search endpoints cap per_page at
// 100; we fetch the max and log when more results exist than we fetched, so a
// silently-truncated result set is visible rather than mistaken for full
// coverage.
export const SEARCH_PER_PAGE = 100;
