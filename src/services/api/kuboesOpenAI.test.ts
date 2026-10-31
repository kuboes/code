import { describe, expect, test } from 'bun:test'
import {
  anthropicRequestToOpenAI,
  createOpenAIFetch,
  openAIResponseToAnthropic,
  translateOpenAIStream,
} from './kuboesOpenAI.ts'

const cfg = { baseUrl: 'http://localhost:11434/v1', apiKey: 'x', model: 'llama-test' }

describe('anthropicRequestToOpenAI', () => {
  test('system + text + tools translate, claude model is replaced by configured model', () => {
    const out = anthropicRequestToOpenAI(
      {
        model: 'claude-opus-4-6',
        max_tokens: 100,
        system: 'you are helpful',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ name: 'read', description: 'r', input_schema: { type: 'object' } }],
      },
      cfg,
    )
    expect(out.model).toBe('llama-test')
    expect(out.messages[0]).toEqual({ role: 'system', content: 'you are helpful' })
    expect(out.messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(out.tools[0].function.name).toBe('read')
  })
  test('tool_use becomes tool_calls, tool_result becomes tool role', () => {
    const out = anthropicRequestToOpenAI(
      {
        model: 'gpt-x',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'read', input: { p: '/tmp' } }],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'hello' }],
          },
        ],
      },
      cfg,
    )
    expect(out.messages[0].tool_calls[0].function.name).toBe('read')
    expect(out.messages[1]).toEqual({ role: 'tool', tool_call_id: 'toolu_1', content: 'hello' })
  })
  test('missing configured model + claude model throws a clear error', () => {
    expect(() =>
      anthropicRequestToOpenAI({ model: 'claude-opus-4-6', messages: [] }, { baseUrl: 'http://x/v1', apiKey: '' }),
    ).toThrow('KUBOES_OPENAI_MODEL')
  })
})

describe('openAIResponseToAnthropic', () => {
  test('text + tool_calls map to anthropic blocks', () => {
    const out = openAIResponseToAnthropic(
      {
        id: 'chatcmpl-1',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: 'looking',
              tool_calls: [{ id: 'call_1', function: { name: 'read', arguments: '{"p":"/tmp"}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      'llama-test',
    )
    expect(out.stop_reason).toBe('tool_use')
    expect(out.content[0]).toEqual({ type: 'text', text: 'looking' })
    expect(out.content[1].input).toEqual({ p: '/tmp' })
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
  })
})

describe('fetch adapter against a mock OpenAI server', () => {
  test('non-streaming -p style call returns anthropic-shaped JSON', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        if (req.url.endsWith('/chat/completions')) {
          return Response.json({
            id: 'chatcmpl-mock',
            choices: [{ finish_reason: 'stop', message: { content: 'hello-mock-openai' } }],
            usage: { prompt_tokens: 3, completion_tokens: 4 },
          })
        }
        return new Response('not found', { status: 404 })
      },
    })
    const fetchFn = createOpenAIFetch({ baseUrl: `http://localhost:${server.port}/v1`, apiKey: 'x', model: 'mock-model' })
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    })
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.content[0].text).toBe('hello-mock-openai')
    server.stop()
  })

  test('streaming call yields anthropic SSE events ending in message_stop', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        if (req.url.endsWith('/chat/completions')) {
          const body =
            'data: {"id":"c1","choices":[{"delta":{"content":"hel"},"finish_reason":null}]}\n\n' +
            'data: {"id":"c1","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n'
          return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
        }
        return new Response('not found', { status: 404 })
      },
    })
    const fetchFn = createOpenAIFetch({ baseUrl: `http://localhost:${server.port}/v1`, apiKey: 'x', model: 'mock-model' })
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 10, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    })
    const text = await res.text()
    expect(text).toContain('event: message_start')
    expect(text).toContain('hel')
    expect(text).toContain('lo')
    expect(text).toContain('event: message_stop')
    server.stop()
  })

  test('streaming tool_calls accumulate as input_json_delta', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        const body =
          'data: {"id":"c1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","function":{"name":"read","arguments":""}}]},"finish_reason":null}]}\n\n' +
          'data: {"id":"c1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"p\\":\\"x\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n' +
          'data: [DONE]\n\n'
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
      },
    })
    const fetchFn = createOpenAIFetch({ baseUrl: `http://localhost:${server.port}/v1`, apiKey: 'x', model: 'mock-model' })
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'x', max_tokens: 10, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    })
    const text = await res.text()
    expect(text).toContain('tool_use')
    expect(text).toContain('input_json_delta')
    server.stop()
  })
})

describe('translateOpenAIStream unit', () => {
  test('text deltas become text_delta events', async () => {
    const input = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"id":"c1","choices":[{"delta":{"content":"a"},"finish_reason":null}]}\n\ndata: [DONE]\n\n'))
        c.close()
      },
    })
    const out = translateOpenAIStream(input, 'm')
    const text = await new Response(out).text()
    expect(text).toContain('text_delta')
    expect(text).toContain('event: message_stop')
  })
})
