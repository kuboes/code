import { describe, test, expect } from "bun:test";
import { anthropicToolUseToOpenAI, openAIToolCallsToAnthropic, accumulateDeltas, isRetryableStatus, backoffMs, pickNextFailover, runWithFailover, groupModels, searchModels } from "./translate.ts";

describe("tool conversion", () => {
  test("round-trip tool_use", () => {
    const a = { role: "assistant" as const, content: [{ type: "tool_use" as const, id: "t1", name: "Read", input: { path: "/x" } }] };
    const o = anthropicToolUseToOpenAI(a);
    expect(o.tool_calls?.[0].function.name).toBe("Read");
    expect(openAIToolCallsToAnthropic(o)).toEqual(a);
  });
  test("streaming accumulates text + tool args", () => {
    const r = accumulateDeltas([{ content: "hi " }, { content: "there" }, { tool_calls: [{ index: 0, id: "t1", function: { name: "Bash", arguments: "{\"cmd\":" } }] }, { tool_calls: [{ index: 0, function: { arguments: "\"ls\"}" } }] }]);
    expect(r.text).toBe("hi there");
    expect(JSON.parse(r.tool_calls[0].function.arguments)).toEqual({ cmd: "ls" });
  });
});
describe("failover", () => {
  test("retryable classification", () => {
    expect(isRetryableStatus(429) && isRetryableStatus(529) && isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400) || isRetryableStatus(401)).toBe(false);
    expect(backoffMs(0)).toBe(500); expect(backoffMs(2)).toBe(2000);
  });
  test("chain skips tried, stops on 401", () => {
    const chain = [{ provider: "a", model: "m1" }, { provider: "b", model: "m2" }];
    expect(pickNextFailover(chain, [{ provider: "a", model: "m1", status: 529 }])).toEqual(chain[1]);
    expect(pickNextFailover(chain, [{ provider: "a", model: "m1", status: 401 }])).toBeNull();
  });
  test("runWithFailover moves to next provider", async () => {
    const chain = [{ provider: "a", model: "m1" }, { provider: "b", model: "m2" }];
    const out = await runWithFailover(chain, async (e) => {
      if (e.provider === "a") throw Object.assign(new Error("overloaded"), { status: 529 });
      return "ok-b";
    });
    expect(out).toBe("ok-b");
  });
});
describe("model picker", () => {
  const ms = [{ provider: "ollama", id: "llama3.1" }, { provider: "anthropic", id: "claude-sonnet-4-6" }, { provider: "ollama", id: "qwen3" }];
  test("group + search + recent", () => {
    expect(Object.keys(groupModels(ms)).sort()).toEqual(["anthropic", "ollama"]);
    expect(searchModels(ms, "qwen").map((m) => m.id)).toEqual(["qwen3"]);
    expect(searchModels(ms, "", ["qwen3"])[0].id).toBe("qwen3");
  });
});
