import { describe, test, expect } from "bun:test";
import { toOpenAI, toAnthropic, openAIModelsUrl } from "./translate.ts";
describe("openai adapter", () => {
  test("system + messages round-trip", () => {
    const msgs = [{ role: "user" as const, content: "hi" }];
    const open = toOpenAI(msgs, "sys");
    expect(open).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
    expect(toAnthropic(open)).toEqual({ system: "sys", messages: msgs });
  });
  test("models url", () => {
    expect(openAIModelsUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1/models");
    expect(openAIModelsUrl("http://localhost:11434")).toBe("http://localhost:11434/v1/models");
  });
});
