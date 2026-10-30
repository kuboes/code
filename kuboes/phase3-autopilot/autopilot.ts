// Original kuboes autopilot skeleton.
// Goal -> plan (steps) -> execute -> verify -> retry, sandbox-by-default.
// Executor/verifier are injected so tests never touch the real filesystem
// except through the explicit FsSnapshot helper below.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type Op = { id: string; kind: "read" | "edit" | "run" | "external"; detail: string; dangerous?: boolean };
export type SandboxPolicy = { sandboxByDefault: boolean; allowlist: string[]; // substring allowlist for run/external details
  requireApprovalForDangerous: boolean };
export const DEFAULT_POLICY: SandboxPolicy = { sandboxByDefault: true, allowlist: ["bun test", "ls", "cat"], requireApprovalForDangerous: true };

export function opAllowed(op: Op, policy: SandboxPolicy): "allow" | "sandbox" | "approval" | "deny" {
  if (op.kind === "read") return "allow";
  if (op.dangerous && policy.requireApprovalForDangerous) return "approval";
  if (op.kind === "run" || op.kind === "external") {
    if (policy.allowlist.some((a) => op.detail.includes(a))) return policy.sandboxByDefault ? "sandbox" : "allow";
    return "approval";
  }
  return policy.sandboxByDefault ? "sandbox" : "allow";
}

export class AuditLog {
  constructor(private file: string) { mkdirSync(dirname(file), { recursive: true }); }
  append(entry: Record<string, unknown>): void { appendFileSync(this.file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n"); }
  read(): Record<string, unknown>[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
}

// Snapshot/restore for a single file (used before edits, one-command restore)
export function snapshotFile(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}
export function restoreFile(path: string, snapshot: string | null): void {
  if (snapshot === null) return; // do not delete unknown files in this skeleton
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, snapshot);
}

export type StepResult = { ok: boolean; output: string };
export async function runAutopilot(opts: {
  goal: string;
  plan: Op[];
  maxRetries?: number;
  policy?: SandboxPolicy;
  audit?: AuditLog;
  approve?: (op: Op) => Promise<boolean>;
  execute: (op: Op, mode: "allow" | "sandbox") => Promise<StepResult>;
  verify: (results: StepResult[]) => Promise<boolean>;
}): Promise<{ success: boolean; attempts: number; results: StepResult[]; summary: string }> {
  const policy = opts.policy ?? DEFAULT_POLICY;
  const maxRetries = opts.maxRetries ?? 2;
  let attempts = 0; let results: StepResult[] = [];
  while (attempts <= maxRetries) {
    attempts++; results = [];
    for (const op of opts.plan) {
      const decision = opAllowed(op, policy);
      opts.audit?.append({ goal: opts.goal, op: op.id, decision, detail: op.detail });
      if (decision === "deny") { results.push({ ok: false, output: "denied" }); continue; }
      if (decision === "approval") {
        const ok = opts.approve ? await opts.approve(op) : false;
        if (!ok) { results.push({ ok: false, output: "not approved" }); continue; }
      }
      const mode = decision === "sandbox" ? "sandbox" : "allow";
      try { results.push(await opts.execute(op, mode)); }
      catch (e) { results.push({ ok: false, output: String(e) }); }
    }
    if (await opts.verify(results)) {
      return { success: true, attempts, results, summary: `Goal done in ${attempts} attempt(s): ${opts.goal}` };
    }
  }
  return { success: false, attempts, results, summary: `Goal failed after ${attempts} attempt(s): ${opts.goal}` };
}
