import { Command } from "commander";
import { run as engineRun } from "./engine.js";
import { loadFindingFromFile } from "./finding.js";
import { renderJson, renderMarkdown, renderTerminal } from "./reporters/index.js";
import { installCommand, type InstallFs } from "./install.js";
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
  installFs?: InstallFs;
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
    v
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
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

type FilledDeps = Required<Omit<CliDeps, "installFs">>;

async function runCheck(repo: string, opts: CliOptions, deps: FilledDeps): Promise<void> {
  const finding = opts.finding ? loadFindingFromFile(opts.finding) : buildFindingFromOptions(opts);
  const verdict = await deps.run({
    repo,
    finding,
    sources: opts.sources
      ? opts.sources
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
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
  const filled: FilledDeps = {
    run: deps.run ?? engineRun,
    write:
      deps.write ??
      ((s: string): void => {
        process.stdout.write(s + "\n");
      }),
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
