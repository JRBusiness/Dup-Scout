import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run } from "../src/engine.js";
import type { Finding, VerdictLabel } from "../src/types.js";
import { recallAtK, verdictMeets, verdictAtMost } from "./metrics.js";
import { replayFactory, recordFactory, type Fixture } from "./replayClient.js";

interface Case {
  name: string;
  repo: string;
  finding: Finding;
  expect: {
    knownItemIds: string[];
    minVerdict: VerdictLabel;
    maxVerdict?: VerdictLabel;
    topK: number;
  };
}

// Exclude github-code: its search.code responses are the deprecated endpoint and
// balloon the recorded fixtures to tens of MB, while the benchmark's recall
// targets (#2264/#2319) come from issue/PR search, not code search.
const BENCH_SOURCES = [
  "github-prs",
  "github-issues",
  "github-commits",
  "github-releases",
  "audit-reports",
  "contests",
];

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

  const clientFactory = live ? recordFactory(fixture) : replayFactory(fixture);

  const verdict = await run({
    repo: c.repo,
    finding: c.finding,
    sources: BENCH_SOURCES,
    clientFactory,
  });

  if (live) writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

  const recall = recallAtK(verdict.matches, c.expect.knownItemIds, c.expect.topK);
  const verdictOk =
    verdictMeets(verdict.label, c.expect.minVerdict) &&
    (c.expect.maxVerdict ? verdictAtMost(verdict.label, c.expect.maxVerdict) : true);
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
  [
    "Dup-Scout benchmark",
    ...rows,
    "",
    `Recall@K avg: ${avgRecall.toFixed(2)}`,
    `Verdict accuracy: ${verdictAcc.toFixed(2)}`,
  ].join("\n"),
);

if (avgRecall < thresholds.minRecallAtK || verdictAcc < thresholds.minVerdictAccuracy) {
  // eslint-disable-next-line no-console
  console.error(
    `benchmark regression: recall ${avgRecall.toFixed(2)} (>= ${thresholds.minRecallAtK}) / ` +
      `verdict ${verdictAcc.toFixed(2)} (>= ${thresholds.minVerdictAccuracy})`,
  );
  process.exit(1);
}
