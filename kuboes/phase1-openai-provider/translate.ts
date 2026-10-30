// Original kuboes adapter (not copied from Claude Code source):
// Anthropic messages <-> OpenAI chat completions, minimal v1 for Ollama.
export type AnthropicMsg = { role: "user" | "assistant"; content: string };
export type OpenAIMsg = { role: "user" | "assistant" | "system"; content: string };

export function toOpenAI(msgs: AnthropicMsg[], system?: string): OpenAIMsg[] {
  const out: OpenAIMsg[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of msgs) out.push({ role: m.role, content: m.content });
  return out;
}

export function toAnthropic(msgs: OpenAIMsg[]): { system?: string; messages: AnthropicMsg[] } {
  const system = msgs.find((m) => m.role === "system")?.content;
  const messages = msgs.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return system ? { system, messages } : { messages };
}

export function openAIModelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
  return base + "/v1/models";
}

export type KuboesProvider = {
  baseUrl: string; // e.g. http://localhost:11434 or .../v1
  apiKey?: string;
  model: string;
};

export async function fetchOpenAIModels(provider: KuboesProvider): Promise<string[]> {
  const res = await fetch(openAIModelsUrl(provider.baseUrl), {
    headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`models fetch failed: ${res.status}`);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((d) => d.id);
}

// ---- Phase 1 continuation: tool calls, streaming, failover, model picker ----

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };
export type AnthropicToolMsg = { role: "assistant"; content: AnthropicContentBlock[] };
export type OpenAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type OpenAIToolMsg = { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] };
export type OpenAIToolResultMsg = { role: "tool"; tool_call_id: string; content: string };

export function anthropicToolUseToOpenAI(msg: AnthropicToolMsg): OpenAIToolMsg {
  const texts = msg.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");
  const tool_calls = msg.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: unknown } => b.type === "tool_use")
    .map((b) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  return tool_calls.length ? { role: "assistant", content: texts || null, tool_calls } : { role: "assistant", content: texts };
}

export function openAIToolCallsToAnthropic(msg: OpenAIToolMsg): AnthropicToolMsg {
  const blocks: AnthropicContentBlock[] = [];
  if (msg.content) blocks.push({ type: "text", text: msg.content });
  for (const tc of msg.tool_calls ?? []) {
    let input: unknown = {};
    try { input = JSON.parse(tc.function.arguments || "{}"); } catch { input = { _raw: tc.function.arguments }; }
    blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }
  return { role: "assistant", content: blocks };
}

// Streaming: OpenAI delta -> Anthropic-style text delta (accumulated text only, tool args accumulate by id)
export type OpenAIDelta = { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] };
export function accumulateDeltas(deltas: OpenAIDelta[]): { text: string; tool_calls: OpenAIToolCall[] } {
  let text = "";
  const byIndex = new Map<number, OpenAIToolCall>();
  for (const d of deltas) {
    if (d.content) text += d.content;
    for (const tc of d.tool_calls ?? []) {
      const cur = byIndex.get(tc.index) ?? { id: tc.id ?? "", type: "function" as const, function: { name: tc.function?.name ?? "", arguments: "" } };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.function.name = tc.function.name;
      if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
      byIndex.set(tc.index, cur);
    }
  }
  return { text, tool_calls: [...byIndex.values()] };
}

// Error classification + failover
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 529 || (status >= 500 && status <= 599);
}
export function backoffMs(attempt: number, baseMs = 500): number {
  return baseMs * 2 ** attempt; // 500, 1000, 2000... (no sleep in pure fn; caller sleeps)
}
export type FailoverAttempt = { provider: string; model: string; status: number };
export function pickNextFailover(chain: { provider: string; model: string }[], failed: FailoverAttempt[]): { provider: string; model: string } | null {
  // Skip any chain entry whose (provider,model) already failed with a retryable status.
  // A non-retryable failure (e.g. 401) stops the chain entirely: return null.
  if (failed.some((f) => !isRetryableStatus(f.status))) return null;
  const tried = new Set(failed.map((f) => `${f.provider}:${f.model}`));
  return chain.find((c) => !tried.has(`${c.provider}:${c.model}`)) ?? null;
}
export async function runWithFailover<T>(
  chain: { provider: string; model: string }[],
  call: (entry: { provider: string; model: string }) => Promise<T>,
  onAttempt?: (entry: { provider: string; model: string }, errStatus: number) => void,
): Promise<T> {
  const failed: FailoverAttempt[] = [];
  let entry = chain[0];
  if (!entry) throw new Error("empty failover chain");
  for (;;) {
    try {
      return await call(entry);
    } catch (e) {
      const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : 500;
      onAttempt?.(entry, status);
      if (!isRetryableStatus(status)) throw e;
      failed.push({ provider: entry.provider, model: entry.model, status });
      const next = pickNextFailover(chain, failed);
      if (!next) throw e;
      entry = next;
    }
  }
}

// Model picker (opencode-style): group by provider, search, recent first
export type ModelEntry = { provider: string; id: string; label?: string };
export function groupModels(models: ModelEntry[]): Record<string, ModelEntry[]> {
  const out: Record<string, ModelEntry[]> = {};
  for (const m of models) (out[m.provider] ??= []).push(m);
  return out;
}
export function searchModels(models: ModelEntry[], query: string, recent: string[] = []): ModelEntry[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? models.filter((m) => `${m.provider} ${m.id} ${m.label ?? ""}`.toLowerCase().includes(q)) : [...models];
  const rank = new Map(recent.map((id, i) => [id, i]));
  return filtered.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}
