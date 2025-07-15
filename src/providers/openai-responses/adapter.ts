import {
  ContentType,
  FileContent,
  MessageRole,
  Conversation as PromptlConversation,
  Message as PromptlMessage,
} from '$promptl/types'

import { ProviderAdapter, type ProviderConversation } from '../adapter'
import {
  MessageRole as OpenAIResponseMessageRole,
  MessageContentSimple,
  ToolCallRequest as OpenAIToolCallRequest,
  MessageInputItem,
  ToolCallResponse,
} from './types'
import {
  isOutputMessage,
  parseOutputMessage,
} from './utils/parsers/outputMessage'
import { isInputMessage, parseInputMessage } from './utils/parsers/inputMessage'
import {
  isFunctionCall,
  isFunctionCallOutput,
  parseFunctionCall,
  parseFunctionCallOutput,
} from './utils/parsers/functionCall'
import { isReasoning, parseReasoning } from './utils/parsers/reasoning'
import {
  isSimpleInputMessage,
  parseSimpleInputMessage,
} from './utils/parsers/parseSimpleContent'
import {
  isWebsearchCall,
  parseWebsearchCall,
} from '$promptl/providers/openai-responses/utils/parsers/webSearch'
import {
  isFileSearchCall,
  parseFileSearch,
} from '$promptl/providers/openai-responses/utils/parsers/fileSearch'

function assertNeverRole(side: 'promptl' | 'openai', x: unknown): never {
  throw new Error(`Unexpected ${side} role: ${x}`)
}

function fromPromptRoleToOpenAIResponseRole(
  role: MessageRole,
): OpenAIResponseMessageRole {
  switch (role) {
    case 'user':
      return 'user'
    case 'assistant':
      return 'assistant'
    case 'system':
      return 'system'
    case 'developer':
      return 'developer'
    default:
      assertNeverRole('promptl', role)
  }
}

function toOpenAiFileData(fileContent: FileContent): string {
  const { file, mimeType } = fileContent

  // only available types for now
  if (mimeType === 'audio/mpeg' || mimeType === 'audio/wav') {
    return file.toString('base64')
  }

  return file.toString()
}

type ContentAndToolCalls = {
  content: MessageContentSimple[]
  toolCalls: OpenAIToolCallRequest[]
}

function fromPromptlContentToOpenAIResponseContent(
  content: PromptlMessage['content'],
) {
  return content.reduce(
    (acc: ContentAndToolCalls, item: PromptlMessage['content'][0]) => {
      const type = item.type

      if (type === ContentType.text) {
        acc.content.push({ text: item.text, type: 'input_text' })
        return acc
      } else if (type === ContentType.image) {
        acc.content.push({
          detail: 'auto',
          type: 'input_image',
          image_url: item.image.toString(),
        })
        return acc
      } else if (type === ContentType.file) {
        acc.content.push({
          type: 'input_file',
          file_data: toOpenAiFileData(item),
        })
        return acc
      } else if (type === ContentType.toolCall) {
        acc.toolCalls.push({
          type: 'function_call',
          call_id: item.toolCallId,
          name: item.toolName,
          arguments: JSON.stringify(item.toolArguments),
        })

        return acc
      } else {
        throw new Error(`Unknown content type: ${type}`)
      }
    },
    { content: [], toolCalls: [] } as ContentAndToolCalls,
  )
}

function fromPromptlMessageToOpenAiResponse(
  promptlMessage: PromptlMessage,
): MessageInputItem[] {
  const { content, toolCalls } = fromPromptlContentToOpenAIResponseContent(
    promptlMessage.content,
  )

  if (promptlMessage.role === MessageRole.tool) {
    return [
      {
        type: 'function_call_output',
        call_id: promptlMessage.toolId,
        output: promptlMessage.content
          .map((c) => (c.type == ContentType.text ? c.text : ''))
          .join(''),
        status: 'completed',
      } satisfies ToolCallResponse,
    ]
  }

  const message = {
    type: 'message' as const,
    role: fromPromptRoleToOpenAIResponseRole(promptlMessage.role),
    content,
  }

  if (!toolCalls.length) return [message]

  return [message, ...toolCalls]
}

type ToolMappings = {
  userTools: Map<string, string>
  websearch: Map<string, string>
  fileSearch: Map<string, string>
}
const fromOpenAiResponseToPromptlMessage =
  (toolMappings: ToolMappings) =>
  (message: MessageInputItem): PromptlMessage | null => {
    if (isReasoning(message)) {
      return parseReasoning(message)
    }

    if (isOutputMessage(message)) {
      return parseOutputMessage({
        message,
        webSearch: toolMappings.websearch,
        fileSearch: toolMappings.fileSearch,
      })
    }

    if (isInputMessage(message)) {
      return parseInputMessage(message)
    }

    if (isFunctionCall(message)) {
      toolMappings.userTools.set(message.call_id, message.name)
      return parseFunctionCall(message)
    }

    if (isFunctionCallOutput(message)) {
      return parseFunctionCallOutput({
        message,
        toolNameMap: toolMappings.userTools,
      })
    }

    if (isWebsearchCall(message)) {
      return parseWebsearchCall({
        message,
        webSearch: toolMappings.websearch,
      })
    }

    if (isFileSearchCall(message)) {
      return parseFileSearch({
        message,
        fileSearch: toolMappings.fileSearch,
      })
    }

    if (isSimpleInputMessage(message)) {
      return parseSimpleInputMessage(message)
    }

    if (message.type === 'item_reference') return null

    if (message.type === 'computer_call') {
      throw new Error('Not implemented computer_call')
    }

    if (message.type === 'computer_call_output') {
      throw new Error('Not implemented computer_call_output')
    }

    throw new Error(
      `Unknown message type ${message.type} in OpenAIResponse adapter`,
    )
  }

export const OpenAIResponsesAdapter: ProviderAdapter<MessageInputItem> = {
  type: 'openaiResponses',
  fromPromptl(promptlConversation: PromptlConversation) {
    return {
      config: promptlConversation.config,
      messages: promptlConversation.messages.flatMap(
        fromPromptlMessageToOpenAiResponse,
      ),
    }
  },

  toPromptl(openAiConversation: ProviderConversation<MessageInputItem>) {
    const messages = openAiConversation.messages

    if (typeof messages === 'string') {
      // Special case. OpenAI Response API accepts a string as input
      return {
        config: openAiConversation.config,
        messages: [
          {
            role: MessageRole.user,
            content: [
              {
                type: ContentType.text,
                text: messages,
              },
            ],
          },
        ],
      }
    }

    const toolMappings = {
      userTools: new Map(),
      websearch: new Map(),
      fileSearch: new Map(),
    } satisfies ToolMappings
    return {
      config: openAiConversation.config,
      messages: messages
        .map(fromOpenAiResponseToPromptlMessage(toolMappings))
        .filter((c) => c !== null),
    }
  },
}
