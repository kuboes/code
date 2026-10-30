import { describe, test, expect } from "bun:test";
import { detectArch, termuxHome } from "./arm.ts";
describe("arm", () => {
  test("termux aarch64 vs linux x64", () => {
    const t = detectArch("linux", "arm64", { TERMUX_VERSION: "0.118", PREFIX: "/data/data/com.termux/files/usr" });
    expect(t.isTermux).toBe(true); expect(t.bunAsset).toContain("aarch64");
    const x = detectArch("linux", "x64", {});
    expect(x.isTermux).toBe(false); expect(x.bunAsset).toContain("x64");
    expect(termuxHome({ HOME: "/home/u" })).toBe("/home/u");
  });
});
