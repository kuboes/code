import { describe, test, expect } from "bun:test";
import { rmSync, writeFileSync, readFileSync } from "node:fs";
import { opAllowed, DEFAULT_POLICY, AuditLog, snapshotFile, restoreFile, runAutopilot } from "./autopilot.ts";

describe("autopilot", () => {
  test("sandbox policy", () => {
    expect(opAllowed({ id: "1", kind: "read", detail: "x" }, DEFAULT_POLICY)).toBe("allow");
    expect(opAllowed({ id: "2", kind: "run", detail: "bun test" }, DEFAULT_POLICY)).toBe("sandbox");
    expect(opAllowed({ id: "3", kind: "run", detail: "rm -rf /", dangerous: true }, DEFAULT_POLICY)).toBe("approval");
    expect(opAllowed({ id: "4", kind: "external", detail: "unknown-cmd" }, DEFAULT_POLICY)).toBe("approval");
  });
  test("snapshot/restore", () => {
    const p = "/tmp/kuboes-snap-test.txt"; writeFileSync(p, "v1");
    const snap = snapshotFile(p); writeFileSync(p, "v2"); restoreFile(p, snap);
    expect(readFileSync(p, "utf-8")).toBe("v1");
  });
  test("loop retries then succeeds, audit logged", async () => {
    try { rmSync("/tmp/kuboes-audit-test.jsonl"); } catch {}
    const audit = new AuditLog("/tmp/kuboes-audit-test.jsonl");
    let calls = 0;
    const r = await runAutopilot({
      goal: "test goal", plan: [{ id: "a", kind: "run", detail: "bun test" }], audit,
      execute: async () => { calls++; return calls < 2 ? { ok: false, output: "flaky" } : { ok: true, output: "ok" }; },
      verify: async (rs) => rs.every((x) => x.ok),
    });
    expect(r.success).toBe(true); expect(r.attempts).toBe(2); expect(audit.read().length).toBeGreaterThan(0);
  });
  test("dangerous op without approval fails closed", async () => {
    const r = await runAutopilot({
      goal: "danger", plan: [{ id: "d", kind: "run", detail: "rm -rf /", dangerous: true }],
      execute: async () => ({ ok: true, output: "should not run" }),
      verify: async (rs) => rs.every((x) => x.ok),
    });
    expect(r.success).toBe(false);
  });
});
