import type { Source } from "../types.js";

export class SourceRegistry {
  private sources: Source[] = [];

  register(s: Source): void {
    this.sources.push(s);
  }

  all(): Source[] {
    return [...this.sources];
  }

  select(ids?: string[]): Source[] {
    if (ids && ids.length > 0) {
      return this.sources.filter((s) => ids.includes(s.id));
    }
    return this.sources.filter((s) => s.enabledByDefault);
  }
}

export function defaultRegistry(): SourceRegistry {
  const r = new SourceRegistry();
  // Sources are registered here as they are implemented (Tasks 7–10).
  return r;
}
