import {
  MessageContent,
  MessageContentSimple,
  MessageInputItem,
  SimpleInputMessage,
} from '$promptl/providers/openai-responses/types'
import { getMimeType } from '$promptl/providers/utils/getMimeType'
import {
  FileContent,
  ImageContent,
  TextContent,
  DeveloperMessage,
  AssistantMessage,
  SystemMessage,
  UserMessage,
} from '$promptl/types'

type PromptlMessage =
  | SystemMessage
  | DeveloperMessage
  | AssistantMessage
  | UserMessage

const SIMPLE_CONTENT_TYPES: MessageContentSimple['type'][] = [
  'input_text',
  'input_image',
  'input_file',
]

export function isSimpleContent(
  content: MessageContent[0],
): content is MessageContentSimple {
  if (typeof content === 'string') return false
  if (!('type' in content)) return false
  if (content.type === 'refusal') return false
  if (content.type === 'output_text') return false

  return SIMPLE_CONTENT_TYPES.includes(content.type)
}

export function parseSimpleContent(content: MessageContentSimple) {
  if (content.type === 'input_text') {
    return {
      type: 'text',
      text: content.text,
    } satisfies TextContent
  }

  if (content.type === 'input_image' && content.image_url) {
    return {
      type: 'image',
      image: content.image_url,
      detail: content.detail,
    } satisfies ImageContent
  }

  if (content.type === 'input_file' && content.file_data) {
    return {
      type: 'file',
      file: content.file_data,
      filename: content.filename,
      file_id: content.file_id,
      mimeType: getMimeType(content.filename),
    } satisfies FileContent
  }
  throw new Error(
    `Unknown type ${content.type} in OpenAIResponse message input content`,
  )
}

function isAnyRole(role: SimpleInputMessage['role']): boolean {
  return (
    role === 'user' ||
    role === 'assistant' ||
    role === 'system' ||
    role === 'developer'
  )
}

export function isSimpleInputMessage(
  message: MessageInputItem,
): message is SimpleInputMessage {
  return message.type === 'message' && isAnyRole(message.role)
}

export function parseSimpleInputMessage(message: SimpleInputMessage) {
  if (typeof message.content === 'string') {
    return {
      role: message.role,
      content: [
        {
          type: 'text',
          text: message.content,
        } satisfies TextContent,
      ],
    } as PromptlMessage
  }

  return {
    role: message.role,
    content: message.content.map(parseSimpleContent),
  } as PromptlMessage
}
