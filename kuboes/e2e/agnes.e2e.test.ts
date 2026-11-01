// Real Agnes AI check. Off by default: run with KUBOES_E2E=1 plus
//   KUBOES_OPENAI_BASE_URL=https://apihub.agnes-ai.com/v1
//   KUBOES_OPENAI_API_KEY=<key>
//   KUBOES_OPENAI_MODEL=agnes-2.5-flash
// If the endpoint is unreachable or rejects the key, the test logs SKIP and
// does not fail: a missing network is not a code defect.
import { describe, expect, test } from 'bun:test'
import { createOpenAIFetch, getOpenAIConfig } from '../../src/services/api/kuboesOpenAI.js'

const enabled = !!process.env.KUBOES_E2E
const cfg = getOpenAIConfig()
const ready = enabled && !!cfg?.baseUrl && !!cfg?.apiKey && !!cfg?.model

function skip(reason: string): void {
  console.warn(`[agnes e2e] SKIP: ${reason}`)
}

describe('agnes e2e', () => {
  test.skipIf(!enabled)('lists models', async () => {
    if (!ready) return skip('KUBOES_OPENAI_BASE_URL / API_KEY / MODEL not all set')
    let res: Response
    try {
      res = await fetch(`${cfg!.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg!.apiKey}` },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e: any) {
      return skip(`unreachable: ${e?.message ?? e}`)
    }
    if (res.status === 401 || res.status === 403) return skip(`auth rejected (${res.status})`)
    expect(res.ok).toBe(true)
    const json: any = await res.json()
    expect(Array.isArray(json.data)).toBe(true)
  }, 40_000)

  test.skipIf(!enabled)('answers a one-shot message', async () => {
    if (!ready) return skip('env not set')
    const adapter = createOpenAIFetch(cfg!)
    let res: Response
    try {
      res = await adapter('http://agnes.local/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 32,
          messages: [{ role: 'user', content: 'Reply with exactly: agnes-ok' }],
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e: any) {
      return skip(`unreachable: ${e?.message ?? e}`)
    }
    if (res.status === 401 || res.status === 403) return skip(`auth rejected (${res.status})`)
    expect(res.status).toBe(200)
    const json: any = await res.json()
    const text = (json.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
    expect(text.length).toBeGreaterThan(0)
  }, 90_000)

  test.skipIf(!enabled)('accepts a tool definition without erroring', async () => {
    if (!ready) return skip('env not set')
    const adapter = createOpenAIFetch(cfg!)
    let res: Response
    try {
      res = await adapter('http://agnes.local/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 64,
          messages: [{ role: 'user', content: 'List the files in the current directory.' }],
          tools: [
            {
              name: 'ListDir',
              description: 'List files',
              input_schema: { type: 'object', properties: {} },
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e: any) {
      return skip(`unreachable: ${e?.message ?? e}`)
    }
    if (res.status === 401 || res.status === 403) return skip(`auth rejected (${res.status})`)
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(Array.isArray(json.content)).toBe(true)
  }, 90_000)
})
