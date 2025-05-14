import { OpenAIResponsesAdapter } from '$promptl/providers/openai-responses/adapter'
import { Message } from '$promptl/types'
import { defaultAdapter, ProviderAdapter } from './adapter'
import { AnthropicAdapter } from './anthropic/adapter'
import { OpenAIAdapter } from './openai/adapter'

export type { ProviderAdapter } from './adapter'

export const Adapters = {
  default: defaultAdapter,
  openai: OpenAIAdapter,
  openaiResponses: OpenAIResponsesAdapter,
  anthropic: AnthropicAdapter,
} as const

export type AdapterKey = keyof typeof Adapters
export type AdapterMessageType<
  T extends keyof typeof Adapters = keyof typeof Adapters,
> = ReturnType<(typeof Adapters)[T]['fromPromptl']>['messages'][number]

export function getAdapter<M extends Message>(adapterType: AdapterKey) {
  const adapter = Adapters[adapterType]
  if (!adapter) throw new Error(`Adapter not found: ${adapterType}`)
  return adapter as ProviderAdapter<M>
}
