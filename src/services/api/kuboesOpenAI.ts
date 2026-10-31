// kuboes addition: Anthropic SDK <-> OpenAI-compatible chat completions
// translation at the fetch layer.
//
// Why fetch-level: every query in src/services/api/claude.ts goes through
// the Anthropic SDK client created in src/services/api/client.ts, so
// swapping the client's `fetch` translates all of them (messages.create,
// beta.messages.create, countTokens) without touching the query code.
// The SDK still thinks it talks Anthropic; the server only ever sees
// OpenAI chat completions.
//
// Env vars:
//   KUBOES_OPENAI_BASE_URL  e.g. http://localhost:11434/v1, https://api.openai.com/v1
//                            (falls back to ANTHROPIC_BASE_URL when KUBOES_USE_OPENAI=1)
//   KUBOES_OPENAI_API_KEY   falls back to ANTHROPIC_API_KEY
//   KUBOES_OPENAI_MODEL     model sent to the OpenAI server. Required when
//                            the requested model is a Claude name, because
//                            an OpenAI server cannot serve it.
//   KUBOES_USE_OPENAI=1     selects the provider (see providers.ts)
//
// Limits, stated honestly:
// - No thinking / extended-thinking, no prompt caching, no Anthropic betas.
//   Those fields are stripped, not translated.
// - No images: image blocks become a "[image]" text placeholder.
// - countTokens has no OpenAI equivalent; it returns a rough char/4 estimate.
// - Streaming tool calls are translated; some OpenAI servers split tool
//   arguments across deltas, which this code accumulates by tool index.

export type OpenAIConfig = {
  baseUrl: string
  apiKey: string
  model?: string
}

export function getOpenAIConfig(): OpenAIConfig | null {
  const baseUrl =
    process.env.KUBOES_OPENAI_BASE_URL || process.env.ANTHROPIC_BASE_URL || ''
  const apiKey =
    process.env.KUBOES_OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  if (!baseUrl) return null
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model: process.env.KUBOES_OPENAI_MODEL || undefined,
  }
}

export function isOpenAIProviderActive(): boolean {
  const v = (process.env.KUBOES_USE_OPENAI || '').toLowerCase().trim()
  return (
    ['1', 'true', 'yes', 'on'].includes(v) ||
    !!process.env.KUBOES_OPENAI_BASE_URL
  )
}

// ---------------------------------------------------------------------------
// Request translation
// ---------------------------------------------------------------------------

type AnthropicBlock = {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  source?: { type?: string; data?: string; media_type?: string }
}

function blockText(b: AnthropicBlock): string {
  if (b.type === 'text') return b.text ?? ''
  if (b.type === 'image') return '[image]'
  if (b.type === 'tool_result') {
    const c = b.content
    if (typeof c === 'string') return c
    if (Array.isArray(c))
      return c.map((x: any) => (typeof x === 'string' ? x : x?.text ?? '')).join('')
    return JSON.stringify(c ?? '')
  }
  return ''
}

function anthropicContentToOpenAIText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    // Drop tool_use blocks here; they are handled as tool_calls separately.
    return content
      .filter((b: AnthropicBlock) => b.type !== 'tool_use')
      .map(blockText)
      .join('')
  }
  return ''
}

export function anthropicRequestToOpenAI(body: any, config: OpenAIConfig): any {
  const requestedModel: string = body.model ?? ''
  const model =
    config.model ||
    (requestedModel.startsWith('claude-') ? undefined : requestedModel)
  if (!model) {
    throw new Error(
      'OpenAI-compatible provider: set KUBOES_OPENAI_MODEL to the model ' +
        'your server serves (the requested model is a Claude name, which ' +
        'an OpenAI server cannot serve).',
    )
  }

  const messages: any[] = []
  const system = body.system
  if (typeof system === 'string' && system) {
    messages.push({ role: 'system', content: system })
  } else if (Array.isArray(system)) {
    const text = system.map((b: AnthropicBlock) => b.text ?? '').join('')
    if (text) messages.push({ role: 'system', content: text })
  }

  for (const m of body.messages ?? []) {
    const content = m.content
    if (typeof content === 'string') {
      messages.push({ role: m.role, content })
      continue
    }
    if (!Array.isArray(content)) continue
    const toolUses = content.filter((b: AnthropicBlock) => b.type === 'tool_use')
    const toolResults = content.filter(
      (b: AnthropicBlock) => b.type === 'tool_result',
    )
    if (toolResults.length) {
      for (const tr of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: tr.tool_use_id,
          content: blockText(tr),
        })
      }
      continue
    }
    const text = anthropicContentToOpenAIText(content)
    const msg: any = { role: m.role, content: text }
    if (toolUses.length) {
      msg.tool_calls = toolUses.map((t: AnthropicBlock) => ({
        id: t.id,
        type: 'function',
        function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
      }))
      if (!text) msg.content = null
    }
    messages.push(msg)
  }

  const out: any = {
    model,
    messages,
    stream: !!body.stream,
  }
  if (typeof body.max_tokens === 'number') out.max_tokens = body.max_tokens
  if (typeof body.temperature === 'number') out.temperature = body.temperature
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map((t: any) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }))
    if (body.tool_choice) {
      if (body.tool_choice.type === 'auto') out.tool_choice = 'auto'
      else if (body.tool_choice.type === 'any') out.tool_choice = 'auto'
      else if (body.tool_choice.type === 'tool' && body.tool_choice.name)
        out.tool_choice = {
          type: 'function',
          function: { name: body.tool_choice.name },
        }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Response translation
// ---------------------------------------------------------------------------

function anthropicErrorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      type: 'error',
      error: { type: 'api_error', message },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  )
}

export function openAIResponseToAnthropic(
  openai: any,
  model: string,
): any {
  const choice = openai.choices?.[0]
  const msg = choice?.message ?? {}
  const content: any[] = []
  if (msg.content) content.push({ type: 'text', text: msg.content })
  for (const tc of msg.tool_calls ?? []) {
    let input: unknown = {}
    try {
      input = JSON.parse(tc.function?.arguments || '{}')
    } catch {
      input = { _raw: tc.function?.arguments }
    }
    content.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name,
      input,
    })
  }
  const stopReason =
    choice?.finish_reason === 'tool_calls'
      ? 'tool_use'
      : choice?.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn'
  return {
    id: openai.id ?? `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openai.usage?.prompt_tokens ?? 0,
      output_tokens: openai.usage?.completion_tokens ?? 0,
    },
  }
}

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

// Translate an OpenAI streaming body into Anthropic SSE events.
// Returns a ReadableStream of text (the Anthropic event stream).
export function translateOpenAIStream(
  openaiBody: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let textIndex = 0
  let textOpen = false
  const toolBlocks = new Map<number, { index: number; id: string; name: string }>()
  let outIndex = 1 // content block index after the text block
  let stopReason: string | null = null
  let usage = { input_tokens: 0, output_tokens: 0 }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (s: string) => controller.enqueue(encoder.encode(s))
      const reader = openaiBody.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload === '[DONE]') continue
            let chunk: any
            try {
              chunk = JSON.parse(payload)
            } catch {
              continue
            }
            if (!started) {
              started = true
              emit(
                sseEvent('message_start', {
                  type: 'message_start',
                  message: {
                    id: chunk.id ?? `msg_${Date.now()}`,
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                  },
                }),
              )
            }
            const choice = chunk.choices?.[0]
            const delta = choice?.delta ?? {}
            if (choice?.finish_reason) {
              stopReason =
                choice.finish_reason === 'tool_calls'
                  ? 'tool_use'
                  : choice.finish_reason === 'length'
                    ? 'max_tokens'
                    : 'end_turn'
            }
            if (chunk.usage) {
              usage = {
                input_tokens: chunk.usage.prompt_tokens ?? usage.input_tokens,
                output_tokens:
                  chunk.usage.completion_tokens ?? usage.output_tokens,
              }
            }
            if (delta.content) {
              if (!textOpen) {
                textOpen = true
                emit(
                  sseEvent('content_block_start', {
                    type: 'content_block_start',
                    index: textIndex,
                    content_block: { type: 'text', text: '' },
                  }),
                )
              }
              emit(
                sseEvent('content_block_delta', {
                  type: 'content_block_delta',
                  index: textIndex,
                  delta: { type: 'text_delta', text: delta.content },
                }),
              )
            }
            for (const tc of delta.tool_calls ?? []) {
              const idx = tc.index ?? 0
              if (!toolBlocks.has(idx)) {
                const blockIndex = outIndex++
                toolBlocks.set(idx, {
                  index: blockIndex,
                  id: tc.id ?? '',
                  name: tc.function?.name ?? '',
                })
                emit(
                  sseEvent('content_block_start', {
                    type: 'content_block_start',
                    index: blockIndex,
                    content_block: {
                      type: 'tool_use',
                      id: tc.id ?? '',
                      name: tc.function?.name ?? '',
                      input: {},
                    },
                  }),
                )
              }
              const blk = toolBlocks.get(idx)!
              if (tc.id) blk.id = tc.id
              if (tc.function?.name) blk.name = tc.function.name
              if (tc.function?.arguments) {
                emit(
                  sseEvent('content_block_delta', {
                    type: 'content_block_delta',
                    index: blk.index,
                    delta: {
                      type: 'input_json_delta',
                      partial_json: tc.function.arguments,
                    },
                  }),
                )
              }
            }
          }
        }
      } finally {
        if (textOpen) {
          // text block stop
          controller.enqueue(
            encoder.encode(
              sseEvent('content_block_stop', {
                type: 'content_block_stop',
                index: textIndex,
              }),
            ),
          )
        }
        for (const blk of toolBlocks.values()) {
          controller.enqueue(
            encoder.encode(
              sseEvent('content_block_stop', {
                type: 'content_block_stop',
                index: blk.index,
              }),
            ),
          )
        }
        controller.enqueue(
          encoder.encode(
            sseEvent('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: stopReason ?? 'end_turn', stop_sequence: null },
              usage,
            }),
          ),
        )
        controller.enqueue(
          encoder.encode(sseEvent('message_stop', { type: 'message_stop' })),
        )
        controller.close()
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Fetch adapter for the Anthropic SDK
// ---------------------------------------------------------------------------

export function createOpenAIFetch(config: OpenAIConfig) {
  const chatUrl =
    config.baseUrl.replace(/\/v1$/, '') + '/v1/chat/completions'
  return async function openAIFetch(
    url: any,
    init: any = {},
  ): Promise<Response> {
    const urlStr = String(url)
    const method = (init.method || 'GET').toUpperCase()
    const rawBody =
      typeof init.body === 'string' ? init.body : undefined

    // countTokens: no OpenAI equivalent; rough estimate, SDK tolerates it.
    if (urlStr.includes('count_tokens') && rawBody) {
      let tokens = 0
      try {
        tokens = Math.max(1, Math.ceil(rawBody.length / 4))
      } catch {
        tokens = 1
      }
      return new Response(JSON.stringify({ input_tokens: tokens }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (method !== 'POST' || !urlStr.includes('/messages')) {
      // Anything else (files, etc.) is out of scope: pass through so the
      // SDK surfaces a real error instead of a silent wrong answer.
      return fetch(url, init)
    }

    let anthropicBody: any
    try {
      anthropicBody = JSON.parse(rawBody ?? '{}')
    } catch {
      return anthropicErrorResponse(400, 'kuboes OpenAI adapter: bad JSON body')
    }

    let openaiBody: any
    try {
      openaiBody = anthropicRequestToOpenAI(anthropicBody, config)
    } catch (e: any) {
      return anthropicErrorResponse(400, e?.message ?? String(e))
    }

    let res: Response
    try {
      res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify(openaiBody),
      })
    } catch (e: any) {
      return anthropicErrorResponse(502, `kuboes OpenAI adapter: ${e?.message ?? e}`)
    }

    if (!res.ok) {
      let message = `OpenAI server returned ${res.status}`
      try {
        const errBody: any = await res.json()
        message = errBody?.error?.message || errBody?.message || message
      } catch {
        // keep default message
      }
      return anthropicErrorResponse(res.status, message)
    }

    if (openaiBody.stream) {
      if (!res.body) return anthropicErrorResponse(502, 'empty stream from OpenAI server')
      const stream = translateOpenAIStream(res.body, openaiBody.model)
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const openaiJson: any = await res.json()
    const anthropicJson = openAIResponseToAnthropic(openaiJson, openaiBody.model)
    return new Response(JSON.stringify(anthropicJson), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}
