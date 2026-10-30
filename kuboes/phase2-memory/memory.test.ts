import { describe, test, expect, beforeEach } from "bun:test";
import { rmSync } from "node:fs";
import { MemoryStore, summarize, tokenize } from "./memory.ts";
const FILE = "/tmp/kuboes-memory-test.jsonl";
beforeEach(() => { try { rmSync(FILE); } catch {} });
describe("memory", () => {
  test("add/search/recall/promote/export", () => {
    const s = new MemoryStore(FILE);
    s.add({ sessionId: "s1", kind: "fact", text: "Ollama runs on localhost:11434 and serves llama3.1", tags: ["ollama"] });
    s.add({ sessionId: "s1", kind: "decision", text: "Autopilot is mandatory, sandbox is default", tags: ["autopilot", "sandbox"] });
    expect(s.count()).toBe(2);
    expect(s.search("ollama")[0].record.tags).toContain("ollama");
    expect(s.search("unrelated-zzz")).toEqual([]);
    const rec = s.search("autopilot")[0].record;
    expect(s.promote(rec.id)).toBe(true);
    expect(s.recall("autopilot")[0].promoted).toBe(true);
    expect(s.exportMarkdown()).toContain("Autopilot is mandatory");
  });
  test("summarize + tokenize", () => {
    expect(summarize("One. Two. Three. Four.", 2)).toBe("One. Two.");
    expect(tokenize("Hello, World! 123")).toContain("hello");
  });
});
