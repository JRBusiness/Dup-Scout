import { describe, it, expect } from "vitest";
import { renderJson, renderMarkdown, renderTerminal } from "../src/reporters/index.js";
import type { Verdict } from "../src/types.js";

const verdict: Verdict = {
  label: "DUPLICATE",
  confidence: 0.82,
  matches: [
    {
      sourceId: "github-prs",
      id: "#12",
      url: "http://pr/12",
      title: "Fix reentrancy in claim()",
      state: "merged",
      matchedKeys: ["claim"],
      score: 88,
    },
  ],
  notes: ["Manual check (contest platform): http://c4"],
};

describe("reporters", () => {
  it("json round-trips", () => {
    expect(JSON.parse(renderJson(verdict)).label).toBe("DUPLICATE");
  });
  it("markdown has a heading, verdict, and evidence row", () => {
    const md = renderMarkdown(verdict);
    expect(md).toContain("## Duplicate check");
    expect(md).toContain("DUPLICATE");
    expect(md).toContain("#12");
    expect(md).toContain("http://c4");
  });
  it("terminal shows label, confidence, and top match", () => {
    const out = renderTerminal(verdict);
    expect(out).toContain("DUPLICATE");
    expect(out).toContain("82%");
    expect(out).toContain("#12");
  });
});
