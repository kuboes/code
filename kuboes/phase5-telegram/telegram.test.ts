import { describe, test, expect } from "bun:test";
import { sendTelegramMessage, formatSummary, telegramApiUrl } from "./telegram.ts";
describe("telegram", () => {
  test("send via mock bot api + format", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = await req.json();
        if (new URL(req.url).pathname === "/botTOKEN/sendMessage" && body.chat_id === "123" && body.text.includes("done")) {
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false }, { status: 400 });
      },
    });
    try {
      expect(await sendTelegramMessage(`http://localhost:${server.port}`, "TOKEN", "123", "done")).toBe(true);
      expect(await sendTelegramMessage(`http://localhost:${server.port}`, "TOKEN", "123", "other")).toBe(false);
    } finally { server.stop(); }
    expect(telegramApiUrl("T", "sendMessage")).toBe("https://api.telegram.org/botT/sendMessage");
    expect(formatSummary("Done", ["a"])).toContain("- a");
  });
});
