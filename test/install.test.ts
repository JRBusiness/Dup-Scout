import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import {
  planInstall,
  performInstall,
  resolveAgents,
  claudeCommandDir,
  codexPromptDir,
  CLAUDE_COMMAND_TEMPLATE,
} from "../src/install.js";

describe("resolveAgents", () => {
  it("defaults to both, honours --all and single flags", () => {
    expect(resolveAgents({})).toEqual({ claude: true, codex: true });
    expect(resolveAgents({ all: true })).toEqual({ claude: true, codex: true });
    expect(resolveAgents({ claude: true })).toEqual({ claude: true, codex: false });
    expect(resolveAgents({ codex: true })).toEqual({ claude: false, codex: true });
  });
});

describe("dir resolution", () => {
  it("honours CLAUDE_CONFIG_DIR and CODEX_HOME, else falls back to home", () => {
    expect(claudeCommandDir({ CLAUDE_CONFIG_DIR: "/x/.claude" }, "/home")).toBe(
      path.join("/x/.claude", "commands"),
    );
    expect(codexPromptDir({ CODEX_HOME: "/y/.codex" }, "/home")).toBe(
      path.join("/y/.codex", "prompts"),
    );
    expect(claudeCommandDir({}, "/home")).toBe(path.join("/home", ".claude", "commands"));
    expect(codexPromptDir({}, "/home")).toBe(path.join("/home", ".codex", "prompts"));
  });
});

describe("planInstall", () => {
  it("builds targets with correct files and templates", () => {
    const t = planInstall({ claude: true, codex: true, env: {}, home: "/home" });
    expect(t.map((x) => x.name)).toEqual(["claude", "codex"]);
    expect(t[0].file).toBe(path.join("/home", ".claude", "commands", "dup-scout.md"));
    expect(t[0].content).toBe(CLAUDE_COMMAND_TEMPLATE);
  });
});

describe("performInstall", () => {
  function fsMock(existing: string[]) {
    const written: Record<string, string> = {};
    return {
      written,
      fs: {
        exists: (p: string) => existing.includes(p),
        mkdir: vi.fn(),
        write: (p: string, d: string) => {
          written[p] = d;
        },
      },
    };
  }
  it("writes new files and skips existing without force", () => {
    const targets = planInstall({ claude: true, codex: true, env: {}, home: "/home" });
    const { fs, written } = fsMock([targets[0].file]);
    const res = performInstall(targets, false, fs);
    expect(res[0].status).toBe("skipped");
    expect(res[1].status).toBe("written");
    expect(Object.keys(written)).toEqual([targets[1].file]);
  });
  it("overwrites with force", () => {
    const targets = planInstall({ claude: true, codex: false, env: {}, home: "/home" });
    const { fs, written } = fsMock([targets[0].file]);
    const res = performInstall(targets, true, fs);
    expect(res[0].status).toBe("written");
    expect(written[targets[0].file]).toContain("dup-scout");
  });
});
