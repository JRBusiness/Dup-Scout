export interface Finding {
  title: string;
  description: string;
  file?: string;
  functions?: string[];
  keys?: string[];
  scopeTag?: string;
  bugClass?: string;
}

export type KeyKind =
  | "function"
  | "file"
  | "contract"
  | "event"
  | "error"
  | "modifier"
  | "invariant"
  | "selector"
  | "pattern"
  | "generic";

export interface WeightedKey {
  term: string;
  weight: number;
  kind: KeyKind;
}

export interface RawMatch {
  sourceId: string;
  id: string;
  url: string;
  title: string;
  state?: string; // open | closed | merged
  snippet?: string;
  filePath?: string;
  signals?: string[]; // "security-title" | "merged" | "audit-ack" | "silent-fix" | "contest"
}

export interface Match extends RawMatch {
  matchedKeys: string[];
  score: number; // 0..100
}

export type VerdictLabel =
  "DUPLICATE" | "KNOWN-ISSUE" | "SILENTLY-FIXED" | "PARTIAL-OVERLAP" | "NOVEL";

export interface Verdict {
  label: VerdictLabel;
  confidence: number; // 0..1
  matches: Match[];
  notes: string[];
}

export type FetchFn = (url: string) => Promise<string>;

export interface SearchContext {
  client: import("./github/client.js").GithubClient;
  finding: Finding;
  keys: WeightedKey[];
  dryRun?: boolean;
  fetch?: FetchFn;
  log: (msg: string) => void;
}

export interface SourceResult {
  matches: RawMatch[];
  notes?: string[];
}

export interface Source {
  id: string;
  enabledByDefault: boolean;
  search(ctx: SearchContext): Promise<SourceResult>;
}
