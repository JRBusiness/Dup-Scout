import { SEARCH_PER_PAGE } from "../sources/constants.js";

export interface RetrievalBudget {
  remaining: number;
}

export const MAX_PAGES = 2;
export const DEFAULT_BUDGET = 40;

export function makeBudget(max: number = DEFAULT_BUDGET): RetrievalBudget {
  return { remaining: max };
}

export interface SearchPage<T> {
  data: { items: T[]; total_count?: number };
}

export async function searchPaged<T>(
  call: (page: number) => Promise<SearchPage<T>>,
  opts: { maxPages: number; budget: RetrievalBudget },
): Promise<{ items: T[]; total: number; truncated: boolean }> {
  const items: T[] = [];
  let total = 0;
  let truncated = false;
  for (let page = 1; page <= opts.maxPages; page++) {
    if (opts.budget.remaining <= 0) {
      truncated = true;
      break;
    }
    opts.budget.remaining -= 1;
    const res = await call(page);
    const pageItems = res.data.items ?? [];
    items.push(...pageItems);
    total = res.data.total_count ?? items.length;
    // Last page reached: the page came back not full AND we've collected
    // everything the server says exists. A short page alone is not enough to
    // stop while total_count still reports more results are available.
    if (pageItems.length < SEARCH_PER_PAGE && items.length >= total) break;
  }
  if (total > items.length) truncated = true;
  return { items, total, truncated };
}

export function mergeById<T>(groups: T[][], idOf: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const item of group) {
      const id = idOf(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}

export async function runSearches<T>(
  queries: string[],
  call: (q: string, page: number) => Promise<SearchPage<T>>,
  idOf: (t: T) => string,
  opts: { maxPages?: number; budget: RetrievalBudget },
): Promise<{ items: T[]; truncated: boolean; total: number }> {
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const groups: T[][] = [];
  let truncated = false;
  let total = 0;
  for (const q of queries) {
    const r = await searchPaged((page) => call(q, page), { maxPages, budget: opts.budget });
    groups.push(r.items);
    truncated = truncated || r.truncated;
    total = Math.max(total, r.total);
  }
  return { items: mergeById(groups, idOf), truncated, total };
}
