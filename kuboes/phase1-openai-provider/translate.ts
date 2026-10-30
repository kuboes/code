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
