import { afterEach, describe, expect, test } from 'bun:test'
import {
  anthropicRequestToOpenAI,
  getOpenAIConfig,
  isOpenAIProviderActive,
  openAIResponseToAnthropic,
  translateOpenAIStream,
  type OpenAIConfig,
} from './kuboesOpenAI.js'

const KEYS = [
  'KUBOES_OPENAI_BASE_URL',
  'KUBOES_OPENAI_API_KEY',
  'KUBOES_OPENAI_MODEL',
  'KUBOES_USE_OPENAI',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
] as const

const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]

function setEnv(vars: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, vars)
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const config: OpenAIConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'k',
  model: 'agnes-2.5-flash',
}

describe('getOpenAIConfig', () => {
  test('returns null without a base url', () => {
    setEnv({})
    expect(getOpenAIConfig()).toBeNull()
  })

  test('prefers KUBOES_* over ANTHROPIC_* and strips trailing slashes', () => {
    setEnv({
      KUBOES_OPENAI_BASE_URL: 'http://localhost:11434/v1///',
      KUBOES_OPENAI_API_KEY: 'kuboes-key',
      ANTHROPIC_BASE_URL: 'https://anthropic.test',
      ANTHROPIC_API_KEY: 'anthropic-key',
    })
    const cfg = getOpenAIConfig()
    expect(cfg?.baseUrl).toBe('http://localhost:11434/v1')
    expect(cfg?.apiKey).toBe('kuboes-key')
  })

  test('falls back to ANTHROPIC_* when KUBOES_* is unset', () => {
    setEnv({
      ANTHROPIC_BASE_URL: 'https://proxy.test',
      ANTHROPIC_API_KEY: 'anthropic-key',
    })
    expect(getOpenAIConfig()?.apiKey).toBe('anthropic-key')
  })
})

describe('isOpenAIProviderActive', () => {
  test('true for KUBOES_USE_OPENAI=1', () => {
    setEnv({ KUBOES_USE_OPENAI: '1' })
    expect(isOpenAIProviderActive()).toBe(true)
  })

  test('true when only the base url is set', () => {
    setEnv({ KUBOES_OPENAI_BASE_URL: 'http://localhost:8080/v1' })
    expect(isOpenAIProviderActive()).toBe(true)
  })

  test('false when neither is set', () => {
    setEnv({})
    expect(isOpenAIProviderActive()).toBe(false)
  })
})

describe('anthropicRequestToOpenAI', () => {
  test('maps a string system prompt and string messages', () => {
    const out = anthropicRequestToOpenAI(
      {
        model: 'claude-sonnet-4-5',
        system: 'be brief',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hi' }],
      },
      config,
    )
    expect(out.model).toBe('agnes-2.5-flash')
    expect(out.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ])
    expect(out.max_tokens).toBe(64)
  })

  test('joins system blocks', () => {
    const out = anthropicRequestToOpenAI(
      {
        model: 'claude-sonnet-4-5',
        system: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
        messages: [],
      },
      config,
    )
    expect(out.messages[0]).toEqual({ role: 'system', content: 'ab' })
  })

  test('maps tool_use to tool_calls and tool_result to role=tool', () => {
    const out = anthropicRequestToOpenAI(
      {
        model: 'claude-sonnet-4-5',
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 't1', content: 'file body' },
            ],
          },
        ],
      },
      config,
    )
    expect(out.messages[0].tool_calls).toEqual([
      {
        id: 't1',
        type: 'function',
        function: { name: 'Read', arguments: '{"path":"a"}' },
      },
    ])
    expect(out.messages[1]).toEqual({
      role: 'tool',
      tool_call_id: 't1',
      content: 'file body',
    })
  })

  test('maps Anthropic tools and a forced tool_choice', () => {
    const out = anthropicRequestToOpenAI(
      {
        model: 'claude-sonnet-4-5',
        messages: [],
        tools: [
          {
            name: 'Grep',
            description: 'search',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        tool_choice: { type: 'tool', name: 'Grep' },
      },
      config,
    )
    expect(out.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'Grep',
          description: 'search',
          parameters: { type: 'object', properties: {} },
        },
      },
    ])
    expect(out.tool_choice).toEqual({
      type: 'function',
      function: { name: 'Grep' },
    })
  })

  test('throws when a Claude model is requested and no model is configured', () => {
    expect(() =>
      anthropicRequestToOpenAI(
        { model: 'claude-sonnet-4-5', messages: [] },
        { baseUrl: 'https://example.test/v1', apiKey: 'k' },
      ),
    ).toThrow(/KUBOES_OPENAI_MODEL/)
  })
})

describe('openAIResponseToAnthropic', () => {
  test('maps text, tool calls and usage', () => {
    const out = openAIResponseToAnthropic(
      {
        id: 'chatcmpl-1',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: 'thinking',
              tool_calls: [
                {
                  id: 'call_1',
                  function: { name: 'Read', arguments: '{"path":"a"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      },
      'agnes-2.5-flash',
    )
    expect(out.content[0]).toEqual({ type: 'text', text: 'thinking' })
    expect(out.content[1]).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 'Read',
      input: { path: 'a' },
    })
    expect(out.stop_reason).toBe('tool_use')
    expect(out.usage).toEqual({ input_tokens: 12, output_tokens: 3 })
  })

  test('keeps unparseable tool arguments instead of throwing', () => {
    const out = openAIResponseToAnthropic(
      {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              tool_calls: [{ id: 'c', function: { name: 'X', arguments: '{oops' } }],
            },
          },
        ],
      },
      'm',
    )
    expect(out.content[0].input).toEqual({ _raw: '{oops' })
    expect(out.stop_reason).toBe('end_turn')
  })

  test('maps finish_reason=length to max_tokens', () => {
    const out = openAIResponseToAnthropic(
      { choices: [{ finish_reason: 'length', message: { content: 'x' } }] },
      'm',
    )
    expect(out.stop_reason).toBe('max_tokens')
  })
})

describe('translateOpenAIStream', () => {
  function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c))
        controller.close()
      },
    })
  }

  async function collect(chunks: string[]): Promise<string> {
    const out = translateOpenAIStream(streamOf(chunks), 'agnes-2.5-flash')
    return await new Response(out).text()
  }

  test('emits message_start, text deltas, message_delta and message_stop', async () => {
    const sse =
      'data: {"id":"c1","choices":[{"delta":{"content":"he"}}]}\n' +
      'data: {"choices":[{"delta":{"content":"llo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n' +
      'data: [DONE]\n'
    const text = await collect([sse])
    expect(text).toContain('event: message_start')
    expect(text).toContain('"text":"he"')
    expect(text).toContain('"text":"llo"')
    expect(text).toContain('event: content_block_stop')
    expect(text).toContain('"stop_reason":"end_turn"')
    expect(text).toContain('"input_tokens":5')
    expect(text).toContain('event: message_stop')
  })

  test('accumulates a tool call whose JSON is split across deltas', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"t1","function":{"name":"Read","arguments":"{\\"pa"}}]}}]}\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"a\\"}"}}]},"finish_reason":"tool_calls"}]}\n' +
      'data: [DONE]\n'
    const text = await collect([sse])
    expect(text).toContain('"type":"tool_use"')
    expect(text).toContain('"partial_json":"{\\"pa"')
    expect(text).toContain('"partial_json":"th\\":\\"a\\"}"')
    expect(text).toContain('"stop_reason":"tool_use"')
  })

  test('survives a chunk boundary in the middle of a data line', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n' +
      'data: [DONE]\n'
    const cut = 20
    const text = await collect([sse.slice(0, cut), sse.slice(cut)])
    expect(text).toContain('"text":"ok"')
  })
})
