export type ContentType =
  | 'file'
  | 'image'
  | 'reasoning'
  | 'redacted-reasoning'
  | 'text'
  | 'tool-call'
  | 'tool-result'

export type MessageRole = 'assistant' | 'developer' | 'system' | 'tool' | 'user'

export enum ContentTypeTagName {
  // This is used to translate between the tag name and the actual tag value
  text = 'content-text',
  image = 'content-image',
  file = 'content-file',
  toolCall = 'tool-call',
}

export type PromptlSourceRef = {
  start: number
  end: number
  identifier?: string
}
interface IMessageContent {
  type: string
  _promptlSourceMap?: PromptlSourceRef[]
  [key: string]: unknown
}
export type ReasoningContent = IMessageContent & {
  type: 'reasoning'
  text: string
  id?: string
  isStreaming?: boolean
}
export type RedactedReasoningContent = IMessageContent & {
  type: 'redacted-reasoning'
  data: string
}
export type TextContent = IMessageContent & {
  type: 'text'
  text: string | undefined
}
export type ImageContent = IMessageContent & {
  type: 'image'
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
}
export type FileContent = IMessageContent & {
  type: 'file'
  file: string | Uint8Array | Buffer | ArrayBuffer | URL
  mimeType: string
}
export type ToolResultContent = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}
export type ToolRequestContent = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}
export type MessageContent =
  | FileContent
  | ImageContent
  | ReasoningContent
  | RedactedReasoningContent
  | TextContent
  | ToolResultContent
  | ToolRequestContent

export type SystemMessage = {
  role: 'system'
  content: MessageContent[]
}

export type UserMessage = {
  role: 'user'
  content: MessageContent[]
  name?: string
}

export type DeveloperMessage = {
  role: 'developer'
  content: MessageContent[]
}

export type AssistantMessage = {
  role: 'assistant'
  content: MessageContent[]
  // DEPRECATED but keeping around for backwards compatibility
  toolCalls?: ToolCall[] | null
  _isGeneratingToolCall?: boolean
}

export type ToolMessage = {
  role: 'tool'
  content: (TextContent | ToolResultContent)[]
}

export type Message =
  | AssistantMessage
  | DeveloperMessage
  | SystemMessage
  | ToolMessage
  | UserMessage

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type Config = Record<string, unknown>
export type Conversation = {
  config: Config
  messages: Message[]
}
export type ConversationMetadata = {
  resolvedPrompt: string
  config: Config
  errors: any[]
  parameters: Set<string>
  setConfig: (config: Config) => string
  includedPromptPaths: Set<string>
}
