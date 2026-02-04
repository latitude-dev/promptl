import type {
  Conversation as PromptlConversation,
  FileContent,
  Message as PromptlMessage,
  MessageContent,
  TextContent,
  ToolResultContent,
  ToolRequestContent,
} from '$promptl/types'

import { ProviderAdapter, type ProviderConversation } from '../adapter'
import {
  AssistantMessage as OpenAIAssistantMessage,
  UserMessage as OpenAIUserMessage,
  Message as OpenAIMessage,
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
    const toolRequestsNamesById: Map<string, string> = new Map()
    return {
      config: openAiConversation.config,
      messages: openAiConversation.messages.map(
        openAiToPromptl(toolRequestsNamesById),
      ),
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

function toPromptlFile(fileContent: OpenAIAudioContent): FileContent {
  const { data, format, ...rest } = fileContent

  return {
    ...rest,
    type: 'file',
    file: data,
    mimeType: `audio/${format}`,
  }
}

function formatToolResultOutput(result: unknown): string {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) {
    const textParts = result
      .filter((item) => item && typeof item === 'object' && 'type' in item)
      .filter((item) => (item as { type?: string }).type === 'text')
      .map((item) => String((item as { text?: unknown }).text ?? ''))
    if (textParts.length) return textParts.join('')
  }
  return JSON.stringify(result)
}

function promptlToOpenAi(message: PromptlMessage): OpenAIMessage {
  if (message.role === 'system' || message.role === 'developer') {
    const { content, ...rest } = message
    if (content.some((c) => c.type !== 'text')) {
      throw new Error(
        `Unsupported content type for system message: ${content.map((c) => c.type).join(', ')}`,
      )
    }
    const textContent = content
    if (textContent.length === 1) {
      return {
        ...rest,
        role: message.role,
        content: (content[0] as TextContent).text,
      } as OpenAIMessage
    }

    return {
      ...rest,
      role: message.role,
      content: textContent as unknown as OpenAITextContent[],
    } as OpenAIMessage
  }

  if (message.role === 'user') {
    const { content, ...rest } = message

    if (
      content.some(
        (c) =>
          ![
            'file',
            'image',
            'reasoning',
            'redacted-reasoning',
            'text',
            'tool-call',
            'tool-result',
          ].includes(c.type),
      )
    ) {
      throw new Error(
        `Unsupported content type for user message: ${content.map((c) => c.type).join(', ')}`,
      )
    }

    const adaptedContent = content.map((c) => {
      if (c.type === 'file') return toOpenAiFile(c)
      return c
    })

    return { ...rest, content: adaptedContent } as OpenAIUserMessage
  }

  if (message.role === 'assistant') {
    const { content, ...rest } = message

    const { toolCalls, textContent } = content.reduce(
      (
        acc: { toolCalls: OpenAIToolCall[]; textContent: OpenAITextContent[] },
        c,
      ) => {
        if (c.type === 'text') {
          acc.textContent.push(c as unknown as OpenAITextContent)
          return acc
        }

        if (c.type === 'tool-call') {
          acc.toolCalls.push({
            id: c.toolCallId,
            type: 'function',
            function: {
              name: c.toolName,
              arguments: JSON.stringify(c.args),
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

  if (message.role === 'tool') {
    const toolResult = message.content.find((c) => c.type === 'tool-result') as
      | ToolResultContent
      | undefined
    if (!toolResult) {
      throw new Error('Tool messages must include tool-result content')
    }
    const output = formatToolResultOutput(toolResult.result)
    return {
      ...message,
      tool_call_id: toolResult.toolCallId,
      content: output,
    } as unknown as OpenAIToolMessage
  }

  const role = (message as { role?: string }).role
  throw new Error(`Unsupported message role: ${role}`)
}

const openAiToPromptl =
  (toolRequestsNamesById: Map<string, string>) =>
  (message: OpenAIMessage): PromptlMessage => {
    const content: MessageContent[] = []

    if (typeof message.content === 'string') {
      content.push({ type: 'text', text: message.content })
    } else if (Array.isArray(message.content)) {
      content.push(
        ...message.content.map((c) => {
          if (c.type === OpenAIContentType.input_audio) return toPromptlFile(c)
          return c as unknown as MessageContent
        }),
      )
    }

    if (message.role === 'assistant') {
      const toolCalls: OpenAIToolCall[] = message.tool_calls || []
      content.push(
        ...toolCalls.map((tc) => {
          toolRequestsNamesById.set(tc.id, tc.function.name)
          return {
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          } as ToolRequestContent
        }),
      )
    }

    if (message.role === 'tool') {
      const { tool_call_id, content: _, ...rest } = message
      const toolName = toolRequestsNamesById.get(tool_call_id) ?? ''
      return {
        ...rest,
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: tool_call_id,
            toolName,
            result:
              typeof message.content === 'string' ? message.content : content,
          },
        ],
      }
    }

    return {
      ...message,
      role: message.role === 'developer' ? 'developer' : message.role,
      content,
    }
  }
