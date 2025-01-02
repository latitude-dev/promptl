import CompileError from '$promptl/error/error'

import { Message } from './message'

export type Config = Record<string, unknown>

export type Conversation = {
  config: Config
  messages: Message[]
}

export type ConversationMetadata = {
  hash: string
  resolvedPrompt: string
  config: Config
  errors: CompileError[]
  parameters: Set<string> // Variables used in the prompt that have not been defined in runtime
  isChain: boolean
  setConfig: (config: Config) => string
  includedPromptPaths: Set<string>
}

export { type SerializedChain } from '$promptl/compiler'
export * from './message'
