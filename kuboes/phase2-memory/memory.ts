// Original kuboes memory: file-backed, cross-session.
// Store: JSONL (one record per line) + a human-editable markdown export.
// Search is token-based scoring (SQLite FTS5 equivalent is out of scope here;
// scoring = title/token hits + recency + promotion bonus).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type MemoryRecord = {
  id: string; createdAt: string; updatedAt: string;
  sessionId: string; kind: "fact" | "decision" | "skill" | "note";
  text: string; tags: string[]; promoted: boolean; source?: string;
};

export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}
export function summarize(text: string, maxSentences = 3): string {
  const parts = text.split(/(?<=[。．.!?])\s+/).filter(Boolean);
  return parts.slice(0, maxSentences).join(" ");
}

export class MemoryStore {
  constructor(private file: string) { mkdirSync(dirname(file), { recursive: true }); }
  private load(): MemoryRecord[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  private save(recs: MemoryRecord[]): void {
    writeFileSync(this.file, recs.map((r) => JSON.stringify(r)).join("\n") + (recs.length ? "\n" : ""));
  }
  add(r: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "promoted"> & { promoted?: boolean }): MemoryRecord {
    const recs = this.load();
    const now = new Date().toISOString();
    const rec: MemoryRecord = { ...r, id: `mem_${Date.now()}_${recs.length}`, createdAt: now, updatedAt: now, promoted: r.promoted ?? false };
    recs.push(rec); this.save(recs); return rec;
  }
  promote(id: string): boolean {
    const recs = this.load(); const r = recs.find((x) => x.id === id);
    if (!r) return false; r.promoted = true; r.updatedAt = new Date().toISOString(); this.save(recs); return true;
  }
  search(query: string, limit = 10): { record: MemoryRecord; score: number }[] {
    const qt = new Set(tokenize(query));
    if (!qt.size) return [];
    return this.load().map((rec) => {
      const hay = tokenize(rec.text + " " + rec.tags.join(" "));
      const hits = [...qt].filter((t) => hay.some((h) => h.includes(t) || t.includes(h))).length;
      const ageDays = Math.max(0, (Date.now() - Date.parse(rec.createdAt)) / 86400000);
      const score = hits * 10 + (rec.promoted ? 5 : 0) + Math.max(0, 3 - ageDays / 30);
      return { record: rec, score };
    }).filter((x) => x.score > 3).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  // Session start recall: query keywords + recent promoted facts, deduped
  recall(keywords: string, limit = 5): MemoryRecord[] {
    const hits = this.search(keywords, limit).map((x) => x.record);
    const promoted = this.load().filter((r) => r.promoted && !hits.some((h) => h.id === r.id)).slice(-limit);
    return [...hits, ...promoted].slice(0, limit);
  }
  exportMarkdown(): string {
    return this.load().map((r) => `- [${r.kind}] ${r.text} (${r.tags.map((t) => `#${t}`).join(" ")})`).join("\n");
  }
  count(): number { return this.load().length; }
}
