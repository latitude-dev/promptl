import type {
  Conversation as PromptlConversation,
  FileContent as PromptlFileContent,
  ImageContent as PromptlImageContent,
  Message as PromptlMessage,
  MessageContent as PromptlMessageContent,
  TextContent as PromptlTextContent,
  ToolResultContent as PromptlToolContent,
  ToolRequestContent as PromptlToolRequestContent,
} from '$promptl/types'

import { ProviderAdapter, type ProviderConversation } from '../adapter'
import {
  AssistantMessage as VercelAIAssistantMessage,
  ContentType as VercelAIContentType,
  ImagePart as VercelAIImagePart,
  FilePart as VercelAIFilePart,
  Message as VercelAIMessage,
  MessageContent as VercelAIMessageContent,
  ToolCallPart as VercelAIToolCallPart,
  UserMessage as VercelAIUserMessage,
  SystemMessage as VercelAISystemMessage,
} from './types'

export const VercelAIAdapter: ProviderAdapter<VercelAIMessage> = {
  type: 'vercel',
  fromPromptl(
    promptlConversation: PromptlConversation,
  ): ProviderConversation<VercelAIMessage> {
    return {
      config: promptlConversation.config,
      messages: promptlConversation.messages.map(promptlToVercelAI),
    }
  },

  toPromptl(
    vercelAIConversation: ProviderConversation<VercelAIMessage>,
  ): PromptlConversation {
    const toolRequestsNamesById: Map<string, string> = new Map()
    return {
      config: vercelAIConversation.config,
      messages: vercelAIConversation.messages.map(
        vercelAIToPromptl(toolRequestsNamesById),
      ),
    }
  },
}

function toVercelAIImage(imageContent: PromptlImageContent): VercelAIImagePart {
  const { image, ...rest } = imageContent
  return {
    ...rest,
    type: VercelAIContentType.image,
    image: image,
  }
}

function toPromptlImage(imageContent: VercelAIImagePart): PromptlImageContent {
  const { image, ...rest } = imageContent
  return {
    ...rest,
    type: 'image',
    image: image,
  }
}

function toVercelAIFile(fileContent: PromptlFileContent): VercelAIFilePart {
  const { file, mimeType, ...rest } = fileContent
  return {
    ...rest,
    type: VercelAIContentType.file,
    data: file,
    mediaType: mimeType,
  }
}

function toPromptlFile(fileContent: VercelAIFilePart): PromptlFileContent {
  const { data, mediaType, ...rest } = fileContent

  return {
    ...rest,
    type: 'file',
    file: data,
    mimeType: mediaType,
  }
}

function promptlToVercelAI(message: PromptlMessage): VercelAIMessage {
  if (message.role === 'system' || message.role === 'developer') {
    const { content, ...rest } = message
    if (content.some((c) => c.type !== 'text')) {
      throw new Error(
        `Unsupported content type for system message: ${content.map((c) => c.type).join(', ')}`,
      )
    }
    const textContent = content as PromptlTextContent[]
    const text = textContent.map((c) => c.text).join('')

    return {
      ...rest,
      role: 'system',
      content: text,
    } as VercelAISystemMessage
  }

  if (message.role === 'user') {
    const { content, ...rest } = message

    const adaptedContent = content.map((c) => {
      if (c.type === 'image') return toVercelAIImage(c)
      if (c.type === 'file') return toVercelAIFile(c)
      return c as VercelAIMessageContent
    })

    return {
      ...rest,
      role: 'user',
      content: adaptedContent,
    } as VercelAIUserMessage
  }

  if (message.role === 'assistant') {
    const { content, ...rest } = message

    const adaptedContent = content.map((c) => {
      if (c.type === 'image') return toVercelAIImage(c)
      if (c.type === 'file') return toVercelAIFile(c)
      if (c.type === 'tool-call') {
        return {
          type: VercelAIContentType.toolCall,
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          args: c.args,
        } as VercelAIToolCallPart
      }
      return c as VercelAIMessageContent
    })

    return {
      ...rest,
      role: 'assistant',
      content: adaptedContent,
    } as VercelAIAssistantMessage
  }

  if (message.role === 'tool') {
    const toolResult = message.content.find((c) => c.type === 'tool-result') as
      | PromptlToolContent
      | undefined
    if (!toolResult) {
      throw new Error('Tool messages must include tool-result content')
    }
    return {
      role: 'tool',
      content: [
        {
          type: VercelAIContentType.toolResult,
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          result: toolResult.result,
          isError: toolResult.isError,
        },
      ],
    }
  }

  const role = (message as { role?: string }).role
  throw new Error(`Unsupported message role: ${role}`)
}

const vercelAIToPromptl =
  (toolRequestsNamesById: Map<string, string>) =>
  (message: VercelAIMessage): PromptlMessage => {
    if (message.role === 'system') {
      return {
        role: 'system',
        content: [{ type: 'text', text: message.content as string }],
      }
    }

    if (message.role === 'user') {
      const content: PromptlMessageContent[] = []

      if (typeof message.content === 'string') {
        content.push({ type: 'text', text: message.content })
      } else if (Array.isArray(message.content)) {
        content.push(
          ...message.content.map((c) => {
            if (c.type === VercelAIContentType.image) return toPromptlImage(c)
            if (c.type === VercelAIContentType.file) return toPromptlFile(c)
            if (c.type === VercelAIContentType.text) {
              return {
                type: 'text',
                text: c.text,
              } as PromptlTextContent
            }
            throw new Error(`Unsupported content type: ${c.type}`)
          }),
        )
      }

      return {
        ...message,
        role: 'user',
        content,
      }
    }

    if (message.role === 'assistant') {
      const content: PromptlMessageContent[] = []

      if (typeof message.content === 'string') {
        content.push({ type: 'text', text: message.content })
      } else if (Array.isArray(message.content)) {
        content.push(
          ...message.content.map((c) => {
            if (c.type === VercelAIContentType.image) return toPromptlImage(c)
            if (c.type === VercelAIContentType.file) return toPromptlFile(c)
            if (c.type === VercelAIContentType.text) {
              return {
                type: 'text',
                text: c.text,
              } as PromptlTextContent
            }
            if (c.type === VercelAIContentType.toolCall) {
              toolRequestsNamesById.set(c.toolCallId, c.toolName)
              return {
                type: 'tool-call',
                toolCallId: c.toolCallId,
                toolName: c.toolName,
                args: c.args,
              } as PromptlToolRequestContent
            }
            throw new Error(`Unsupported content type: ${c.type}`)
          }),
        )
      }

      return {
        ...message,
        role: 'assistant',
        content,
      }
    }

    if (message.role === 'tool') {
      const toolResult = Array.isArray(message.content)
        ? message.content.find((c) => c.type === VercelAIContentType.toolResult)
        : undefined
      if (!toolResult) {
        throw new Error('Tool messages must include tool-result content')
      }

      return {
        ...message,
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: toolResult.toolCallId,
            toolName:
              toolResult.toolName ||
              toolRequestsNamesById.get(toolResult.toolCallId) ||
              '',
            result: toolResult.result,
            isError: toolResult.isError,
          },
        ],
      }
    }

    throw new Error(
      `Unsupported message role: ${(message as VercelAIMessage).role}`,
    )
  }
