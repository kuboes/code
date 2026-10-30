// Original kuboes Telegram adapter: Bot API via fetch, token passed in (never hardcoded).
// Approval flow uses an injected poller so tests use a mock server, not Telegram.
export function telegramApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}
export async function sendTelegramMessage(apiBase: string, token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { ok?: boolean };
  return body.ok === true;
}
export function formatSummary(title: string, lines: string[]): string {
  return `${title}\n${lines.map((l) => `- ${l}`).join("\n")}`;
}
// Simplex note (design only, no implementation): Simplex has no Bot API;
// the realistic route is simplex-chat CLI as a bridge process, deferred after Telegram.
export const SIMPLEX_DESIGN = "deferred: bridge via simplex-chat CLI, not a Bot API";
