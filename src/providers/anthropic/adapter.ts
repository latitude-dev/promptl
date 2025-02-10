import {
  ContentType,
  MessageRole,
  Conversation as PromptlConversation,
  ImageContent as PromptlImageContent,
  FileContent as PromptlFileContent,
  Message as PromptlMessage,
  MessageContent as PromptlMessageContent,
  SystemMessage as PromptlSystemMessage,
  TextContent as PromptlTextContent,
  ToolCallContent as PromptlToolCallContent,
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
          if (message.role === MessageRole.system) {
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
            role: MessageRole.user,
          })
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
          role: MessageRole.system,
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
            : [{ type: ContentType.text, text: systemPrompt }],
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
    type: ContentType.image,
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
    type: ContentType.file,
    file: source.data,
    mimeType: source.media_type,
  }
}

function promptlToAnthropic(message: PromptlMessage): AnthropicMessage {
  if (message.role === MessageRole.system) {
    throw new Error(
      'Anthropic only supports system messages at the top of the conversation',
    )
  }

  if (message.role === MessageRole.user) {
    const { content, ...rest } = message
    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.image) return toAnthropicImage(c)
      if (c.type === ContentType.file) return toAnthropicFile(c)
      return c
    })

    return {
      ...rest,
      content: adaptedContent,
    } as AnthropicUserMessage
  }

  if (message.role === MessageRole.assistant) {
    const { content, ...rest } = message

    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.image) return toAnthropicImage(c)
      if (c.type === ContentType.file) return toAnthropicFile(c)
      if (c.type === ContentType.toolCall) {
        return {
          type: AnthropicContentType.tool_use,
          id: c.toolCallId,
          name: c.toolName,
          input: c.toolArguments,
        }
      }
      return c
    })

    return {
      ...rest,
      content: adaptedContent,
    } as AnthropicAssistantMessage
  }

  if (message.role === MessageRole.tool) {
    const { toolId, content, ...rest } = message
    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.image) return toAnthropicImage(c)
      if (c.type === ContentType.file) return toAnthropicFile(c)
      return c
    })
    return {
      ...rest,
      role: MessageRole.user,
      content: [
        {
          type: AnthropicContentType.tool_result,
          tool_use_id: toolId,
          ...(content.length ? { content: adaptedContent } : {}),
        },
      ],
    } as AnthropicUserMessage
  }

  //@ts-expect-error — There are no more supported roles. Typescript knows it and is yelling me back
  throw new Error(`Unsupported message role: ${message.role}`)
}

const anthropicToPromptl =
  (toolRequestsNamesById: Map<string, string>) =>
    (message: AnthropicMessage): PromptlMessage[] => {
      const messageContent: AnthropicMessageContent[] =
        typeof message.content === 'string'
          ? [{ type: AnthropicContentType.text, text: message.content }]
          : message.content

      if (message.role === MessageRole.assistant) {
        return [
          {
            ...message,
            content: messageContent.map((c) => {
              if (c.type === AnthropicContentType.image) return toPromptlImage(c)
              if (c.type === AnthropicContentType.document)
                return toPromptlFile(c)
              if (c.type === AnthropicContentType.tool_use) {
                toolRequestsNamesById.set(c.id, c.name)
                return {
                  type: ContentType.toolCall,
                  toolCallId: c.id,
                  toolName: c.name,
                  toolArguments: c.input,
                } as PromptlToolCallContent
              }
              return c as unknown as PromptlMessageContent
            }),
          },
        ]
      }

      if (message.role === MessageRole.user) {
        const { userMessage, toolMessages } = messageContent.reduce(
          (
            acc: {
              userMessage: PromptlUserMessage
              toolMessages: PromptlToolMessage[]
            },
            c,
          ) => {
            if (c.type === AnthropicContentType.tool_result) {
              const toolResponseContent = c.content
                ? Array.isArray(c.content)
                  ? c.content.map((cc) => {
                    if (cc.type === AnthropicContentType.image)
                      return toPromptlImage(cc)
                    return cc as unknown as PromptlMessageContent
                  })
                  : [
                    {
                      type: ContentType.text,
                      text: c.content!,
                    } as PromptlTextContent,
                  ]
                : []

              acc.toolMessages.push({
                ...message,
                role: MessageRole.tool,
                toolId: c.tool_use_id,
                toolName: toolRequestsNamesById.get(c.tool_use_id) ?? '',
                content: toolResponseContent,
              })
            } else if (c.type === AnthropicContentType.image) {
              acc.userMessage.content.push(toPromptlImage(c))
            } else if (c.type === AnthropicContentType.document) {
              acc.userMessage.content.push(toPromptlFile(c))
            } else {
              acc.userMessage.content.push(c as unknown as PromptlMessageContent)
            }
            return acc
          },
          {
            userMessage: { ...message, role: MessageRole.user, content: [] },
            toolMessages: [],
          },
        )

        return [
          ...toolMessages,
          ...(userMessage.content.length ? [userMessage] : []),
        ]
      }

      //@ts-expect-error — There are no more supported roles. Typescript knows it and is yelling me back
      throw new Error(`Unsupported message role: ${message.role}`)
  }
