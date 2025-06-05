import {
  AdapterMessageType,
  Adapters,
  ProviderAdapter,
} from '$promptl/providers'
import { ProviderConversation } from '$promptl/providers/adapter'
import { ConversationMetadata, Message } from '$promptl/types'
import { z } from 'zod'

import { Chain } from './chain'
import { Scan } from './scan'
import type { CompileOptions, Document, ReferencePromptFn } from './types'
import { Fragment } from '$promptl/parser/interfaces'

export async function render<M extends AdapterMessageType = Message>({
  prompt,
  parameters = {},
  adapter = Adapters.openai as ProviderAdapter<M>,
  ...compileOptions
}: {
  prompt: string
  parameters?: Record<string, unknown>
  adapter?: ProviderAdapter<M>
} & CompileOptions): Promise<ProviderConversation<M>> {
  const iterator = new Chain({ prompt, parameters, adapter, ...compileOptions })
  const { messages, config } = await iterator.step()
  return { messages, config }
}

export function createChain({
  prompt,
  parameters,
  ...compileOptions
}: {
  prompt: string
  parameters: Record<string, unknown>
} & CompileOptions): Chain {
  return new Chain({ prompt, parameters, ...compileOptions })
}

export function scan({
  prompt,
  serialized,
  fullPath,
  referenceFn,
  withParameters,
  configSchema,
  requireConfig,
}: {
  prompt: string
  serialized?: Fragment
  fullPath?: string
  referenceFn?: ReferencePromptFn
  withParameters?: string[]
  configSchema?: z.ZodType
  requireConfig?: boolean
}): Promise<ConversationMetadata> {
  return new Scan({
    document: { path: fullPath ?? '', content: prompt },
    serialized,
    referenceFn,
    withParameters,
    configSchema,
    requireConfig,
  }).run()
}

type SerializedChain = ReturnType<Chain['serialize']>

export { Chain, type SerializedChain, type Document, type ReferencePromptFn }
