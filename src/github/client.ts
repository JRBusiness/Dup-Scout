import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const DupOctokit: typeof Octokit = Octokit.plugin(throttling, retry);

export interface GithubClient {
  octokit: InstanceType<typeof DupOctokit>;
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

export function resolveToken(
  o: {
    explicit?: string;
    env?: NodeJS.ProcessEnv;
    ghTokenReader?: () => string | undefined;
  } = {},
): string | undefined {
  const env = o.env ?? process.env;
  const reader = o.ghTokenReader ?? defaultGhTokenReader;
  if (o.explicit) return o.explicit;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  if (env.GH_TOKEN) return env.GH_TOKEN;
  return reader();
}

export function createGithubClient(
  repo: string,
  token?: string,
  fetchImpl?: typeof fetch,
): GithubClient {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid repo "${repo}", expected owner/repo`);
  }
  const octokit = new DupOctokit({
    auth: resolveToken({ explicit: token }),
    request: fetchImpl ? { fetch: fetchImpl } : undefined,
    throttle: {
      onRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
      onSecondaryRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
    },
  });
  return { octokit, owner, repo: name };
}
