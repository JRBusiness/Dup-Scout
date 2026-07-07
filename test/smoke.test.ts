import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index.js";

describe("toolchain", () => {
  it("exposes a version string", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
