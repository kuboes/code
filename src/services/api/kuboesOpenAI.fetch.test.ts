// Integration check of the fetch adapter: a real HTTP round trip to a mock
// OpenAI server, exercised through createOpenAIFetch the same way the
// Anthropic SDK calls it (POST /v1/messages).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createOpenAIFetch, type OpenAIConfig } from './kuboesOpenAI.js'

const REPLY = 'hello-adapter'

function sse(events: string[]): Response {
  return new Response(events.join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}

let server: ReturnType<typeof Bun.serve>
let config: OpenAIConfig
const seen: { path: string; model?: string; auth?: string }[] = []

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url)
      const body = (await req.json().catch(() => ({}))) as {
        stream?: boolean
        model?: string
      }
      seen.push({
        path: url.pathname,
        model: body.model,
        auth: req.headers.get('authorization') ?? undefined,
      })
      if (!body.stream) {
        if (body.model === 'fail-model') {
          return Response.json(
            { error: { message: 'rate limited by mock' } },
            { status: 429 },
          )
        }
        return Response.json({
          id: 'chatcmpl-adapter',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: REPLY },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        })
      }
      return sse([
        `data: ${JSON.stringify({ id: 'c1', choices: [{ delta: { content: REPLY } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } })}\n\n`,
        'data: [DONE]\n\n',
      ])
    },
  })
  config = {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    apiKey: 'test-key',
    model: 'mock-model',
  }
})

afterAll(() => server.stop(true))

const anthropicBody = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 64,
    messages: [{ role: 'user', content: 'hi' }],
    ...extra,
  })

describe('createOpenAIFetch', () => {
  test('translates a non-streaming /v1/messages call', async () => {
    const fetchAdapter = createOpenAIFetch(config)
    const res = await fetchAdapter('http://anthropic.test/v1/messages', {
      method: 'POST',
      body: anthropicBody(),
    })
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.content[0]).toEqual({ type: 'text', text: REPLY })
    expect(json.stop_reason).toBe('end_turn')
    const last = seen.at(-1)!
    expect(last.path).toBe('/v1/chat/completions')
    expect(last.model).toBe('mock-model')
    expect(last.auth).toBe('Bearer test-key')
  })

  test('translates a streaming call into Anthropic SSE', async () => {
    const fetchAdapter = createOpenAIFetch(config)
    const res = await fetchAdapter('http://anthropic.test/v1/messages', {
      method: 'POST',
      body: anthropicBody({ stream: true }),
    })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const text = await res.text()
    expect(text).toContain('event: message_start')
    expect(text).toContain(`"text":"${REPLY}"`)
    expect(text).toContain('event: message_stop')
  })

  test('answers count_tokens locally instead of calling the server', async () => {
    const fetchAdapter = createOpenAIFetch(config)
    const before = seen.length
    const res = await fetchAdapter(
      'http://anthropic.test/v1/messages/count_tokens',
      { method: 'POST', body: anthropicBody() },
    )
    const json: any = await res.json()
    expect(json.input_tokens).toBeGreaterThan(0)
    expect(seen.length).toBe(before)
  })

  test('turns a server error into an Anthropic error body', async () => {
    const fetchAdapter = createOpenAIFetch({
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      apiKey: 'k',
      model: 'fail-model',
    })
    const res = await fetchAdapter('http://anthropic.test/v1/messages', {
      method: 'POST',
      body: anthropicBody(),
    })
    expect(res.status).toBe(429)
    const json: any = await res.json()
    expect(json.type).toBe('error')
    expect(json.error.message).toContain('rate limited')
  })
})
