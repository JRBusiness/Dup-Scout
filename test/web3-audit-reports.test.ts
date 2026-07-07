import { describe, it, expect, vi } from "vitest";
import { auditReports } from "../src/sources/web3/auditReports.js";
import type { SearchContext } from "../src/types.js";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function ctxWith(getContent: ReturnType<typeof vi.fn>): SearchContext {
  return {
    client: { owner: "acme", repo: "vault", octokit: { rest: { repos: { getContent } } } },
    finding: { title: "Rounding in settle", description: "", functions: ["settle"] },
    keys: [{ term: "settle", weight: 5, kind: "function" }],
    log: () => {},
  } as unknown as SearchContext;
}

describe("auditReports", () => {
  it("flags audit-ack when a markdown report acknowledges a key hit", async () => {
    const getContent = vi
      .fn()
      // first call: list the "audits" directory
      .mockResolvedValueOnce({
        data: [
          {
            type: "file",
            name: "oz.md",
            path: "audits/oz.md",
            download_url: "u",
            html_url: "http://audits/oz.md",
          },
        ],
      })
      // second call: fetch the file content
      .mockResolvedValueOnce({
        data: {
          type: "file",
          content: b64("The settle rounding issue is acknowledged and won't fix."),
          encoding: "base64",
        },
      });
    const res = await auditReports.search(ctxWith(getContent));
    expect(res.matches[0].signals).toContain("audit-ack");
    expect(res.matches[0].url).toBe("http://audits/oz.md");
  });

  it("adds a note for pdf reports and returns no throw when dirs are missing", async () => {
    const getContent = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            type: "file",
            name: "report.pdf",
            path: "audits/report.pdf",
            html_url: "http://audits/report.pdf",
          },
        ],
      })
      .mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    const res = await auditReports.search(ctxWith(getContent));
    expect(res.matches).toEqual([]);
    expect(res.notes?.some((n) => n.includes("report.pdf"))).toBe(true);
  });
});
