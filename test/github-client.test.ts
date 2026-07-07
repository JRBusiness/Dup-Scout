import { describe, it, expect } from "vitest";
import { resolveToken, createGithubClient } from "../src/github/client.js";

describe("resolveToken", () => {
  it("prefers explicit over env over gh CLI", () => {
    expect(resolveToken({ explicit: "X", env: { GITHUB_TOKEN: "Y" } })).toBe("X");
  });
  it("falls back to GITHUB_TOKEN then GH_TOKEN", () => {
    expect(resolveToken({ env: { GITHUB_TOKEN: "Y" } })).toBe("Y");
    expect(resolveToken({ env: { GH_TOKEN: "Z" } })).toBe("Z");
  });
  it("falls back to gh CLI reader", () => {
    expect(resolveToken({ env: {}, ghTokenReader: () => "GH" })).toBe("GH");
  });
  it("returns undefined when nothing is available", () => {
    expect(resolveToken({ env: {}, ghTokenReader: () => undefined })).toBeUndefined();
  });
});

describe("createGithubClient", () => {
  it("parses owner/repo", () => {
    const c = createGithubClient("acme/vault", "tok");
    expect(c.owner).toBe("acme");
    expect(c.repo).toBe("vault");
  });
  it("throws on malformed repo", () => {
    expect(() => createGithubClient("not-a-repo")).toThrow(/owner\/repo/);
  });
});
