import {
  ContentType,
  MessageRole,
  Conversation as PromptlConversation,
  ImageContent as PromptlImageContent,
  FileContent as PromptlFileContent,
  Message as PromptlMessage,
  MessageContent as PromptlMessageContent,
  TextContent as PromptlTextContent,
  ToolCallContent as PromptlToolCallContent,
} from '$promptl/types'

import { ProviderAdapter, type ProviderConversation } from '../adapter'
import {
  AssistantMessage as VercelAIAssistantMessage,
  ContentType as VercelAIContentType,
  ImagePart as VercelAIImagePart,
  FilePart as VercelAIFilePart,
  Message as VercelAIMessage,
  MessageContent as VercelAIMessageContent,
  TextPart as VercelAITextPart,
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
    type: ContentType.image,
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
    type: ContentType.file,
    file: data,
    mimeType: mediaType,
  }
}

function promptlToVercelAI(message: PromptlMessage): VercelAIMessage {
  if (message.role === MessageRole.system) {
    const { content, ...rest } = message
    if (content.some((c) => c.type !== ContentType.text)) {
      throw new Error(
        `Unsupported content type for system message: ${content.map((c) => c.type).join(', ')}`,
      )
    }
    const textContent = content as PromptlTextContent[]
    const text = textContent.map((c) => c.text).join('')

    return {
      ...rest,
      role: MessageRole.system,
      content: text,
    } as VercelAISystemMessage
  }

  if (message.role === MessageRole.user) {
    const { content, ...rest } = message

    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.image) return toVercelAIImage(c)
      if (c.type === ContentType.file) return toVercelAIFile(c)
      return c as VercelAIMessageContent
    })

    return {
      ...rest,
      role: MessageRole.user,
      content: adaptedContent,
    } as VercelAIUserMessage
  }

  if (message.role === MessageRole.assistant) {
    const { content, ...rest } = message

    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.image) return toVercelAIImage(c)
      if (c.type === ContentType.file) return toVercelAIFile(c)
      if (c.type === ContentType.toolCall) {
        return {
          type: VercelAIContentType.toolCall,
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          args: c.toolArguments,
        } as VercelAIToolCallPart
      }
      return c as VercelAIMessageContent
    })

    return {
      ...rest,
      role: MessageRole.assistant,
      content: adaptedContent,
    } as VercelAIAssistantMessage
  }

  if (message.role === MessageRole.tool) {
    const { toolId, toolName, content, ...rest } = message
    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.image) return toVercelAIImage(c)
      if (c.type === ContentType.file) return toVercelAIFile(c)
      return {
        type: VercelAIContentType.text,
        text: c.type === ContentType.text ? c.text : JSON.stringify(c),
      } as VercelAITextPart
    })

    return {
      ...rest,
      role: MessageRole.tool,
      content: [
        {
          type: VercelAIContentType.toolResult,
          toolCallId: toolId,
          toolName: toolName,
          result:
            adaptedContent.length === 1
              ? adaptedContent[0]!.text
              : adaptedContent.map((c) => c.text).join(''),
        },
      ],
    }
  }

  throw new Error(`Unsupported message role: ${message.role}`)
}

const vercelAIToPromptl =
  (toolRequestsNamesById: Map<string, string>) =>
  (message: VercelAIMessage): PromptlMessage => {
    if (message.role === MessageRole.system) {
      return {
        role: MessageRole.system,
        content: [{ type: ContentType.text, text: message.content as string }],
      }
    }

    if (message.role === MessageRole.user) {
      const content: PromptlMessageContent[] = []

      if (typeof message.content === 'string') {
        content.push({ type: ContentType.text, text: message.content })
      } else if (Array.isArray(message.content)) {
        content.push(
          ...message.content.map((c) => {
            if (c.type === VercelAIContentType.image) return toPromptlImage(c)
            if (c.type === VercelAIContentType.file) return toPromptlFile(c)
            if (c.type === VercelAIContentType.text) {
              return {
                type: ContentType.text,
                text: c.text,
              } as PromptlTextContent
            }
            throw new Error(`Unsupported content type: ${c.type}`)
          }),
        )
      }

      return {
        ...message,
        role: MessageRole.user,
        content,
      }
    }

    if (message.role === MessageRole.assistant) {
      const content: PromptlMessageContent[] = []

      if (typeof message.content === 'string') {
        content.push({ type: ContentType.text, text: message.content })
      } else if (Array.isArray(message.content)) {
        content.push(
          ...message.content.map((c) => {
            if (c.type === VercelAIContentType.image) return toPromptlImage(c)
            if (c.type === VercelAIContentType.file) return toPromptlFile(c)
            if (c.type === VercelAIContentType.text) {
              return {
                type: ContentType.text,
                text: c.text,
              } as PromptlTextContent
            }
            if (c.type === VercelAIContentType.toolCall) {
              toolRequestsNamesById.set(c.toolCallId, c.toolName)
              return {
                type: ContentType.toolCall,
                toolCallId: c.toolCallId,
                toolName: c.toolName,
                toolArguments: c.args,
              } as PromptlToolCallContent
            }
            throw new Error(`Unsupported content type: ${c.type}`)
          }),
        )
      }

      return {
        ...message,
        role: MessageRole.assistant,
        content,
      }
    }

    if (message.role === MessageRole.tool) {
      const content: PromptlMessageContent[] = []
      let toolCallId = ''
      let toolName = ''

      if (Array.isArray(message.content)) {
        message.content.forEach((c) => {
          if (c.type === VercelAIContentType.toolResult) {
            toolCallId = c.toolCallId
            toolName = c.toolName
            // Convert tool result to text content for PromptL
            content.push({
              type: ContentType.text,
              text:
                typeof c.result === 'string'
                  ? c.result
                  : JSON.stringify(c.result),
            } as PromptlTextContent)
          } else if (c.type === VercelAIContentType.text) {
            content.push({ type: ContentType.text, text: c.text })
          } else if (c.type === VercelAIContentType.image) {
            content.push(toPromptlImage(c))
          } else if (c.type === VercelAIContentType.file) {
            content.push(toPromptlFile(c))
          }
        })
      }

      return {
        ...message,
        role: MessageRole.tool,
        toolId: toolCallId,
        toolName:
          toolName ||
          (toolCallId ? toolRequestsNamesById.get(toolCallId) : '') ||
          '',
        content,
      }
    }

    throw new Error(
      `Unsupported message role: ${(message as VercelAIMessage).role}`,
    )
  }
