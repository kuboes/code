import { afterEach, describe, expect, test } from 'bun:test'
import { getAPIProvider, getOpenAIConfig, isOpenAICompatibleProvider } from './providers.js'

const KEYS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'KUBOES_USE_OPENAI',
  'KUBOES_OPENAI_BASE_URL',
  'KUBOES_OPENAI_API_KEY',
  'KUBOES_OPENAI_MODEL',
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

describe('getAPIProvider', () => {
  test('defaults to firstParty', () => {
    setEnv({})
    expect(getAPIProvider()).toBe('firstParty')
    expect(isOpenAICompatibleProvider()).toBe(false)
  })

  test('selects openai-compatible from KUBOES_USE_OPENAI', () => {
    setEnv({ KUBOES_USE_OPENAI: '1' })
    expect(getAPIProvider()).toBe('openai-compatible')
    expect(isOpenAICompatibleProvider()).toBe(true)
  })

  test('selects openai-compatible from KUBOES_OPENAI_BASE_URL alone', () => {
    setEnv({ KUBOES_OPENAI_BASE_URL: 'http://localhost:8080/v1' })
    expect(getAPIProvider()).toBe('openai-compatible')
  })

  test('bedrock wins over vertex, foundry and openai', () => {
    setEnv({
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1',
      CLAUDE_CODE_USE_FOUNDRY: '1',
      KUBOES_USE_OPENAI: '1',
    })
    expect(getAPIProvider()).toBe('bedrock')
  })

  test('vertex wins over foundry and openai', () => {
    setEnv({ CLAUDE_CODE_USE_VERTEX: '1', CLAUDE_CODE_USE_FOUNDRY: '1', KUBOES_USE_OPENAI: '1' })
    expect(getAPIProvider()).toBe('vertex')
  })

  test('foundry wins over openai', () => {
    setEnv({ CLAUDE_CODE_USE_FOUNDRY: '1', KUBOES_USE_OPENAI: '1' })
    expect(getAPIProvider()).toBe('foundry')
  })
})

describe('getOpenAIConfig', () => {
  test('null without a base url', () => {
    setEnv({})
    expect(getOpenAIConfig()).toBeNull()
  })

  test('trims trailing slashes and keeps the model', () => {
    setEnv({
      KUBOES_OPENAI_BASE_URL: 'https://apihub.agnes-ai.com/v1/',
      KUBOES_OPENAI_API_KEY: 'k',
      KUBOES_OPENAI_MODEL: 'agnes-2.5-flash',
    })
    expect(getOpenAIConfig()).toEqual({
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'k',
      model: 'agnes-2.5-flash',
    })
  })
})
