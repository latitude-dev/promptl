import type {
  Conversation as PromptlConversation,
  FileContent as PromptlFileContent,
  ImageContent as PromptlImageContent,
  Message as PromptlMessage,
  MessageContent as PromptlMessageContent,
  SystemMessage as PromptlSystemMessage,
  TextContent as PromptlTextContent,
  ToolResultContent as PromptlToolContent,
  ToolRequestContent as PromptlToolRequestContent,
  ToolMessage as PromptlToolMessage,
  UserMessage as PromptlUserMessage,
} from '$promptl/types'

import { ProviderAdapter, type ProviderConversation } from '../adapter'
import {
  AssistantMessage as AnthropicAssistantMessage,
  ContentType as AnthropicContentType,
  ImageContent as AnthropicImageContent,
  DocumentContent as AnthropicDocumentContent,
  Message as AnthropicMessage,
  MessageContent as AnthropicMessageContent,
  TextContent as AnthropicTextContent,
  UserMessage as AnthropicUserMessage,
} from './types'

export const AnthropicAdapter: ProviderAdapter<AnthropicMessage> = {
  type: 'anthropic',
  fromPromptl(
    promptlConversation: PromptlConversation,
  ): ProviderConversation<AnthropicMessage> {
    // Initialize system messages
    const systemPrompt: AnthropicMessageContent[] = []
    const systemConfig = promptlConversation.config.system as
      | undefined
      | string
      | AnthropicMessageContent[]
    if (Array.isArray(systemConfig)) systemPrompt.push(...systemConfig)
    if (typeof systemConfig === 'string') {
      systemPrompt.push({ type: AnthropicContentType.text, text: systemConfig })
    }

    const [systemMessagesOnTop, restMessages] =
      promptlConversation.messages.reduce(
        (acc: [PromptlMessage[], PromptlMessage[]], message) => {
          if (message.role === 'system' || message.role === 'developer') {
            acc[0].push(message)
          } else {
            acc[1].push(message)
          }
          return acc
        },
        [[], []],
      )

    systemPrompt.push(
      ...systemMessagesOnTop
        .map((m) => {
          const messageToAnthropic = promptlToAnthropic({
            ...m,
            role: 'user',
          } as PromptlMessage)
          const content = messageToAnthropic.content
          if (typeof content === 'string') {
            return [
              { type: AnthropicContentType.text, text: content },
            ] as AnthropicTextContent[]
          }
          return content
        })
        .flat(),
    )

    return {
      config: {
        ...promptlConversation.config,
        system: systemPrompt,
      },
      messages: restMessages.map(promptlToAnthropic),
    }
  },

  toPromptl(
    anthropicConversation: ProviderConversation<AnthropicMessage>,
  ): PromptlConversation {
    const toolRequestsNamesById: Map<string, string> = new Map()
    const { system: systemPrompt, ...restConfig } =
      anthropicConversation.config as {
        system:
          | undefined
          | string
          | (
              | AnthropicTextContent
              | AnthropicImageContent
              | AnthropicDocumentContent
            )[]
        [key: string]: unknown
      }

    const systemMessages: PromptlSystemMessage[] = systemPrompt
      ? [
          {
            role: 'system',
            content: Array.isArray(systemPrompt)
              ? systemPrompt.map((c) => {
                  if (c.type === AnthropicContentType.image) {
                    return toPromptlImage(c)
                  }
                  if (c.type === AnthropicContentType.document) {
                    return toPromptlFile(c)
                  }
                  return c as unknown as PromptlMessageContent
                })
              : [{ type: 'text', text: systemPrompt }],
          },
        ]
      : []

    return {
      config: restConfig,
      messages: [
        ...systemMessages,
        ...anthropicConversation.messages
          .map(anthropicToPromptl(toolRequestsNamesById))
          .flat(),
      ],
    }
  },
}

function toAnthropicImage(
  imageContent: PromptlImageContent,
): AnthropicImageContent {
  const { image, ...rest } = imageContent
  return {
    ...rest,
    type: AnthropicContentType.image,
    source: {
      type: 'base64', // only available type for now
      media_type: 'image/png',
      data: image.toString('base64'),
    },
  }
}

function toPromptlImage(
  imageContent: AnthropicImageContent,
): PromptlImageContent {
  const { source, ...rest } = imageContent
  return {
    ...rest,
    type: 'image',
    image: source.data,
  }
}

function toAnthropicFile(
  fileContent: PromptlFileContent,
): AnthropicTextContent | AnthropicDocumentContent {
  const { file, mimeType, ...rest } = fileContent

  // only available type for now
  if (mimeType === 'application/pdf') {
    return {
      ...rest,
      type: AnthropicContentType.document,
      source: {
        type: 'base64',
        media_type: mimeType,
        data: file.toString('base64'),
      },
    }
  }

  return {
    ...rest,
    type: AnthropicContentType.text,
    text: file.toString(),
  }
}

function toPromptlFile(
  fileContent: AnthropicDocumentContent,
): PromptlFileContent {
  const { source, ...rest } = fileContent

  return {
    ...rest,
    type: 'file',
    file: source.data,
    mimeType: source.media_type,
  }
}

function toAnthropicToolResultContent(
  result: unknown,
): string | (AnthropicTextContent | AnthropicImageContent)[] | undefined {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) {
    const adapted: (AnthropicTextContent | AnthropicImageContent)[] = []
    for (const item of result) {
      if (!item || typeof item !== 'object' || !('type' in item)) continue
      const type = (item as { type?: string }).type
      if (type === 'image') {
        adapted.push(toAnthropicImage(item as PromptlImageContent))
        continue
      }
      if (type === 'text') {
        adapted.push({
          type: AnthropicContentType.text,
          text: String((item as PromptlTextContent).text ?? ''),
        })
        continue
      }
      if (type === 'file') {
        adapted.push({
          type: AnthropicContentType.text,
          text: String((item as PromptlFileContent).file ?? ''),
        })
      }
    }
    return adapted.length ? adapted : undefined
  }
  if (result === undefined || result === null) return undefined
  return JSON.stringify(result)
}

function promptlToAnthropic(message: PromptlMessage): AnthropicMessage {
  if (message.role === 'system' || message.role === 'developer') {
    throw new Error(
      'Anthropic only supports system messages at the top of the conversation',
    )
  }

  if (message.role === 'user') {
    const { content, ...rest } = message
    const adaptedContent = content.map((c) => {
      if (c.type === 'image') return toAnthropicImage(c)
      if (c.type === 'file') return toAnthropicFile(c)
      return c
    })

    return {
      ...rest,
      content: adaptedContent,
    } as AnthropicUserMessage
  }

  if (message.role === 'assistant') {
    const { content, ...rest } = message

    const adaptedContent = content.map((c) => {
      if (c.type === 'image') return toAnthropicImage(c)
      if (c.type === 'file') return toAnthropicFile(c)
      if (c.type === 'tool-call') {
        return {
          type: AnthropicContentType.tool_use,
          id: c.toolCallId,
          name: c.toolName,
          input: c.args,
        }
      }
      return c
    })

    return {
      ...rest,
      content: adaptedContent,
    } as AnthropicAssistantMessage
  }

  if (message.role === 'tool') {
    const toolResult = message.content.find((c) => c.type === 'tool-result') as
      | PromptlToolContent
      | undefined
    if (!toolResult) {
      throw new Error('Tool messages must include tool-result content')
    }
    const content = toAnthropicToolResultContent(toolResult.result)
    return {
      role: 'user',
      content: [
        {
          type: AnthropicContentType.tool_result,
          tool_use_id: toolResult.toolCallId,
          ...(content !== undefined ? { content } : {}),
          ...(toolResult.isError ? { is_error: true } : {}),
        },
      ],
    } as AnthropicUserMessage
  }

  const role = (message as { role?: string }).role
  throw new Error(`Unsupported message role: ${role}`)
}

const anthropicToPromptl =
  (toolRequestsNamesById: Map<string, string>) =>
  (message: AnthropicMessage): PromptlMessage[] => {
    const messageContent: AnthropicMessageContent[] =
      typeof message.content === 'string'
        ? [{ type: AnthropicContentType.text, text: message.content }]
        : message.content

    if (message.role === 'assistant') {
      return [
        {
          ...message,
          role: 'assistant',
          content: messageContent.map((c) => {
            if (c.type === AnthropicContentType.image) return toPromptlImage(c)
            if (c.type === AnthropicContentType.document)
              return toPromptlFile(c)
            if (c.type === AnthropicContentType.tool_use) {
              toolRequestsNamesById.set(c.id, c.name)
              return {
                type: 'tool-call',
                toolCallId: c.id,
                toolName: c.name,
                args: c.input,
              } as PromptlToolRequestContent
            }
            return c as unknown as PromptlMessageContent
          }),
        },
      ]
    }

    if (message.role === 'user') {
      const userContent: PromptlMessageContent[] = []
      const toolMessages: PromptlToolMessage[] = []

      for (const c of messageContent) {
        if (c.type === AnthropicContentType.tool_result) {
          const result = Array.isArray(c.content)
            ? c.content.map((cc) => {
                if (cc.type === AnthropicContentType.image)
                  return toPromptlImage(cc)
                return cc as unknown as PromptlMessageContent
              })
            : c.content

          toolMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: c.tool_use_id,
                toolName: toolRequestsNamesById.get(c.tool_use_id) ?? '',
                result: result ?? '',
                isError: c.is_error,
              },
            ],
          })
          continue
        }

        if (c.type === AnthropicContentType.image) {
          userContent.push(toPromptlImage(c))
          continue
        }

        if (c.type === AnthropicContentType.document) {
          userContent.push(toPromptlFile(c))
          continue
        }

        userContent.push(c as unknown as PromptlMessageContent)
      }

      const userMessage: PromptlUserMessage = {
        ...message,
        role: 'user',
        content: userContent,
      }

      return [...toolMessages, ...(userContent.length ? [userMessage] : [])]
    }

    const role = (message as { role?: string }).role
    throw new Error(`Unsupported message role: ${role}`)
  }
