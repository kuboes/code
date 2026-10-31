import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'openai-compatible'

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : isEnvTruthy(process.env.KUBOES_USE_OPENAI) ||
            !!process.env.KUBOES_OPENAI_BASE_URL
          ? 'openai-compatible'
          : 'firstParty'
}

/**
 * kuboes addition: true when the OpenAI-compatible provider is selected.
 * Wired into the query path since 2026-11-01: src/services/api/client.ts
 * creates the Anthropic SDK client with src/services/api/kuboesOpenAI.ts
 * as its fetch adapter, so queries are translated to OpenAI chat
 * completions. Default behaviour is unchanged when this is off.
 */
export function isOpenAICompatibleProvider(): boolean {
  return getAPIProvider() === 'openai-compatible'
}

export type KuboesOpenAIConfig = {
  baseUrl: string
  apiKey: string
  model?: string
}

// Shared with kuboesOpenAI.ts (kept dependency-free there so its unit
// tests can import it without loading the app). Values must match.
export function getOpenAIConfig(): KuboesOpenAIConfig | null {
  const baseUrl =
    process.env.KUBOES_OPENAI_BASE_URL || process.env.ANTHROPIC_BASE_URL || ''
  if (!baseUrl) return null
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey:
      process.env.KUBOES_OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.KUBOES_OPENAI_MODEL || undefined,
  }
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
