import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";

export interface GithubClient {
  octokit: Octokit;
  owner: string;
  repo: string;
}

function defaultGhTokenReader(): string | undefined {
  try {
    const t = execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

export function resolveToken(o: {
  explicit?: string;
  env?: NodeJS.ProcessEnv;
  ghTokenReader?: () => string | undefined;
} = {}): string | undefined {
  const env = o.env ?? process.env;
  const reader = o.ghTokenReader ?? defaultGhTokenReader;
  if (o.explicit) return o.explicit;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  if (env.GH_TOKEN) return env.GH_TOKEN;
  return reader();
}

export function createGithubClient(repo: string, token?: string): GithubClient {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid repo "${repo}", expected owner/repo`);
  }
  const octokit = new Octokit({ auth: resolveToken({ explicit: token }) });
  return { octokit, owner, repo: name };
}
