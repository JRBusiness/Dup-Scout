import type { Verdict } from "../types.js";

export function renderJson(v: Verdict): string {
  return JSON.stringify(v, null, 2);
}
