import { homedir } from "node:os";
import path, { delimiter } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

export const CLAUDE_COMMAND_TEMPLATE = `---
description: Check whether a finding is a likely duplicate/known-issue with dup-scout
argument-hint: <owner/repo> "<finding title>" [more context]
allowed-tools: Bash(dup-scout:*)
---

You are helping decide whether a bug bounty finding would be marked a duplicate
before it is submitted. Use the \`dup-scout\` CLI (already on PATH).

Finding context from the user: $ARGUMENTS

Steps:
1. Determine the target GitHub repo (owner/repo) and a short finding title,
   description, and — if known — the affected file, function(s), and in-scope tag.
2. Run the checker, for example:
   \`dup-scout <owner/repo> --title "<title>" --desc "<desc>" --file <path> --function <name> --markdown\`
3. Read the verdict (DUPLICATE / KNOWN-ISSUE / SILENTLY-FIXED / PARTIAL-OVERLAP /
   NOVEL) and the evidence table. State whether it is safe to submit, cite the
   strongest matching PR/issue/commit/audit link, and list any manual checks it printed.
`;

export const CODEX_PROMPT_TEMPLATE = `Check whether a bug bounty finding is a likely duplicate before submitting, using the \`dup-scout\` CLI (already on PATH).

Finding context from the user: $ARGUMENTS

Steps:
1. Determine the target GitHub repo (owner/repo), a short finding title and
   description, and — if known — the affected file, function(s), and in-scope tag.
2. Run: dup-scout <owner/repo> --title "<title>" --desc "<desc>" --file <path> --function <name> --markdown
3. Read the verdict (DUPLICATE / KNOWN-ISSUE / SILENTLY-FIXED / PARTIAL-OVERLAP /
   NOVEL) and evidence table. Say whether it is safe to submit, cite the strongest
   matching link, and list any manual checks printed.
`;

export interface InstallTarget {
  name: "claude" | "codex";
  dir: string;
  file: string;
  content: string;
}

export interface InstallResult {
  name: string;
  file: string;
  status: "written" | "skipped";
}

export interface InstallFs {
  exists: (p: string) => boolean;
  mkdir: (p: string) => void;
  write: (p: string, data: string) => void;
}

const realFs: InstallFs = {
  exists: existsSync,
  mkdir: (p) => mkdirSync(p, { recursive: true }),
  write: (p, data) => writeFileSync(p, data, "utf8"),
};

export function claudeCommandDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return path.join(env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"), "commands");
}

export function codexPromptDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return path.join(env.CODEX_HOME ?? path.join(home, ".codex"), "prompts");
}

export function resolveAgents(opts: { claude?: boolean; codex?: boolean; all?: boolean }): {
  claude: boolean;
  codex: boolean;
} {
  if (opts.all || (!opts.claude && !opts.codex)) return { claude: true, codex: true };
  return { claude: !!opts.claude, codex: !!opts.codex };
}

export function planInstall(opts: {
  claude: boolean;
  codex: boolean;
  env?: NodeJS.ProcessEnv;
  home?: string;
}): InstallTarget[] {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const targets: InstallTarget[] = [];
  if (opts.claude) {
    const dir = claudeCommandDir(env, home);
    targets.push({
      name: "claude",
      dir,
      file: path.join(dir, "dup-scout.md"),
      content: CLAUDE_COMMAND_TEMPLATE,
    });
  }
  if (opts.codex) {
    const dir = codexPromptDir(env, home);
    targets.push({
      name: "codex",
      dir,
      file: path.join(dir, "dup-scout.md"),
      content: CODEX_PROMPT_TEMPLATE,
    });
  }
  return targets;
}

export function performInstall(
  targets: InstallTarget[],
  force: boolean,
  fs: InstallFs = realFs,
): InstallResult[] {
  return targets.map((t) => {
    if (fs.exists(t.file) && !force) {
      return { name: t.name, file: t.file, status: "skipped" };
    }
    fs.mkdir(t.dir);
    fs.write(t.file, t.content);
    return { name: t.name, file: t.file, status: "written" };
  });
}

export function hasOnPath(bin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".cmd", ".exe", ".ps1", ""] : [""];
  return dirs.some((d) => exts.some((e) => existsSync(path.join(d, bin + e))));
}

export function installCommand(
  opts: { claude?: boolean; codex?: boolean; all?: boolean; force?: boolean },
  deps: { fs?: InstallFs; env?: NodeJS.ProcessEnv; home?: string; pathHasBin?: () => boolean } = {},
): { results: InstallResult[]; warnings: string[] } {
  const agents = resolveAgents(opts);
  const targets = planInstall({
    claude: agents.claude,
    codex: agents.codex,
    env: deps.env,
    home: deps.home,
  });
  const results = performInstall(targets, !!opts.force, deps.fs);
  const warnings: string[] = [];
  const present = deps.pathHasBin ? deps.pathHasBin() : hasOnPath("dup-scout");
  if (!present) {
    warnings.push(
      "`dup-scout` was not found on PATH; the /dup-scout command shells out to it. Install globally with `npm i -g dup-scout`.",
    );
  }
  return { results, warnings };
}
