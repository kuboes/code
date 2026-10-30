import { describe, test, expect } from "bun:test";
import { listBundles, installBundle } from "./marketplace.ts";
describe("marketplace", () => {
  test("bundles + install + unknown", () => {
    expect(listBundles().map((b) => b.id)).toContain("dev");
    expect(installBundle("dev").plugins).toContain("git-helper");
    expect(() => installBundle("nope")).toThrow();
  });
});
