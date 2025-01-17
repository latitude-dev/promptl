import {
  ContentType,
  MessageContent,
  MessageRole,
  Conversation as PromptlConversation,
  Message as PromptlMessage,
  TextContent,
  ToolCallContent,
  FileContent,
} from '$promptl/types'

import { ProviderAdapter, type ProviderConversation } from '../adapter'
import {
  AssistantMessage as OpenAIAssistantMessage,
  UserMessage as OpenAIUserMessage,
  Message as OpenAIMessage,
  SystemMessage as OpenAISystemMessage,
  TextContent as OpenAITextContent,
  ToolCall as OpenAIToolCall,
  ToolMessage as OpenAIToolMessage,
  AudioContent as OpenAIAudioContent,
  ContentType as OpenAIContentType,
} from './types'

export const OpenAIAdapter: ProviderAdapter<OpenAIMessage> = {
  type: 'openai',
  fromPromptl(
    promptlConversation: PromptlConversation,
  ): ProviderConversation<OpenAIMessage> {
    return {
      config: promptlConversation.config,
      messages: promptlConversation.messages.map(promptlToOpenAi),
    }
  },

  toPromptl(
    openAiConversation: ProviderConversation<OpenAIMessage>,
  ): PromptlConversation {
    return {
      config: openAiConversation.config,
      messages: openAiConversation.messages.map(openAiToPromptl),
    }
  },
}

function toOpenAiFile(
  fileContent: FileContent,
): OpenAITextContent | OpenAIAudioContent {
  const { file, mimeType, ...rest } = fileContent

  // only available types for now
  if (mimeType === 'audio/mpeg' || mimeType === 'audio/wav') {
    return {
      ...rest,
      type: OpenAIContentType.input_audio,
      data: file.toString('base64'),
      format: mimeType.split('/').at(-1)!,
    }
  }

  return {
    ...rest,
    type: OpenAIContentType.text,
    text: file.toString(),
  }
}

function toPromptlFile(
  fileContent: OpenAIAudioContent,
): FileContent {
  const { data, format, ...rest } = fileContent

  return {
    ...rest,
    type: ContentType.file,
    file: data,
    mimeType: `audio/${format}`,
  }
}

function promptlToOpenAi(message: PromptlMessage): OpenAIMessage {
  if (message.role === MessageRole.system) {
    const { content, ...rest } = message
    if (content.some((c) => c.type !== ContentType.text)) {
      throw new Error(
        `Unsupported content type for system message: ${content.map((c) => c.type).join(', ')}`,
      )
    }
    const textContent = content
    if (textContent.length === 1) {
      return {
        ...rest,
        content: (content[0] as TextContent).text,
      } as OpenAISystemMessage
    }

    return { ...rest, content: textContent as unknown as OpenAITextContent[] }
  }

  if (message.role === MessageRole.user) {
    const { content, ...rest } = message

    if (content.some((c) => !Object.values(ContentType).includes(c.type))) {
      throw new Error(
        `Unsupported content type for user message: ${content.map((c) => c.type).join(', ')}`,
      )
    }

    const adaptedContent = content.map((c) => {
      if (c.type === ContentType.file) return toOpenAiFile(c)
      return c
    })

    return { ...rest, content: adaptedContent } as OpenAIUserMessage
  }

  if (message.role === MessageRole.assistant) {
    const { content, ...rest } = message

    const { toolCalls, textContent } = content.reduce(
      (
        acc: { toolCalls: OpenAIToolCall[]; textContent: OpenAITextContent[] },
        c,
      ) => {
        if (c.type === ContentType.text) {
          acc.textContent.push(c as unknown as OpenAITextContent)
          return acc
        }

        if (c.type === ContentType.toolCall) {
          acc.toolCalls.push({
            id: c.toolCallId,
            type: 'function',
            function: {
              name: c.toolName,
              arguments: JSON.stringify(c.toolArguments),
            },
          })
          return acc
        }

        throw new Error(
          `Unsupported content type for assistant message: ${c.type}`,
        )
      },
      { toolCalls: [], textContent: [] },
    )

    return {
      ...rest,
      content: textContent,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    } as OpenAIAssistantMessage
  }

  if (message.role === MessageRole.tool) {
    const { toolId, ...rest } = message
    return {
      ...rest,
      tool_call_id: toolId,
    } as unknown as OpenAIToolMessage
  }

  //@ts-expect-error — There are no more supported roles. Typescript knows it and is yelling me back
  throw new Error(`Unsupported message role: ${message.role}`)
}

function openAiToPromptl(message: OpenAIMessage): PromptlMessage {
  const content: MessageContent[] = []
  if (typeof message.content === 'string') {
    content.push({ type: ContentType.text, text: message.content })
  } else {
    content.push(...message.content.map((c) => {
      if (c.type === OpenAIContentType.input_audio) return toPromptlFile(c)
      return c as unknown as MessageContent
    }))
  }

  if (message.role === MessageRole.assistant) {
    const toolCalls: OpenAIToolCall[] = message.tool_calls || []
    content.push(
      ...toolCalls.map(
        (tc) =>
          ({
            type: ContentType.toolCall,
            toolCallId: tc.id,
            toolName: tc.function.name,
            toolArguments: JSON.parse(tc.function.arguments),
          }) as ToolCallContent,
      ),
    )
  }

  if (message.role === MessageRole.tool) {
    const { tool_call_id, content: _, ...rest } = message
    return {
      toolId: tool_call_id,
      content,
      ...rest,
    }
  }

  return {
    ...message,
    content,
  }
}
