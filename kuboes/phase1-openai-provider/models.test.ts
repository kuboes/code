import { describe, test, expect } from "bun:test";
import { fetchOpenAIModels } from "./translate.ts";
describe("ollama models fetch", () => {
  test("mock /v1/models", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        if (new URL(req.url).pathname === "/v1/models") {
          return Response.json({ data: [{ id: "llama3.1" }, { id: "qwen3" }] });
        }
        return new Response("not found", { status: 404 });
      },
    });
    try {
      const models = await fetchOpenAIModels({ baseUrl: `http://localhost:${server.port}`, model: "llama3.1" });
      expect(models).toEqual(["llama3.1", "qwen3"]);
    } finally {
      server.stop();
    }
  });
});
