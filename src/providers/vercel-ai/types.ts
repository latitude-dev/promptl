/**
 * Vercel AI SDK message types
 * Based on the AI SDK Core message structure
 */

export enum ContentType {
  text = 'text',
  image = 'image',
  file = 'file',
  toolCall = 'tool-call',
  toolResult = 'tool-result',
  reasoning = 'reasoning',
}

interface IMessageContent {
  type: ContentType
  [key: string]: unknown
}

export type TextPart = IMessageContent & {
  type: ContentType.text
  text: string
}

export type ImagePart = IMessageContent & {
  type: ContentType.image
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
  mediaType?: string
}

export type FilePart = IMessageContent & {
  type: ContentType.file
  data: string | Uint8Array | Buffer | ArrayBuffer | URL
  mediaType: string
  filename?: string
}

export type ToolCallPart = IMessageContent & {
  type: ContentType.toolCall
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export type ToolResultPart = IMessageContent & {
  type: ContentType.toolResult
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

export type ReasoningPart = IMessageContent & {
  type: ContentType.reasoning
  text: string
}

export type MessageContent =
  | TextPart
  | ImagePart
  | FilePart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart

export type SystemMessage = {
  role: 'system'
  content: string
}

export type UserMessage = {
  role: 'user'
  content: string | MessageContent[]
}

export type AssistantMessage = {
  role: 'assistant'
  content: string | MessageContent[]
}

export type ToolMessage = {
  role: 'tool'
  content: MessageContent[]
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
