import {
  MessageInputItem,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseOutputRefusal,
} from '$promptl/providers/openai-responses/types'
import {
  ContentType,
  Message as PromptlMessage,
  MessageRole,
  TextContent,
  AssistantMessage,
  ToolCallContent,
} from '$promptl/types'

export function isOutputMessage(
  message: MessageInputItem,
): message is ResponseOutputMessage {
  return (
    message.type === 'message' &&
    'status' in message &&
    message.role === 'assistant' &&
    'id' in message
  )
}

function isOutputTextContent(
  content: ResponseOutputMessage['content'][0],
): content is ResponseOutputText {
  return content.type === 'output_text'
}

function isOutputRefusalContent(
  content: ResponseOutputMessage['content'][0],
): content is ResponseOutputRefusal {
  return content.type === 'refusal'
}

function getOpenAIBuiltinFunctionCallId({
  messageId,
  webSearch,
  fileSearch,
}: {
  messageId: string
  webSearch: Map<string, string>
  fileSearch: Map<string, string>
}) {
  const id = messageId.replace(/^msg_/, '')
  const callWebSearchId = webSearch.get(id)
  if (callWebSearchId) {
    return { toolId: callWebSearchId, toolName: 'web_search_call' }
  }

  const callFileSearchId = fileSearch.get(id)

  if (callFileSearchId) {
    return { toolId: callFileSearchId, toolName: 'file_search_call' }
  }

  return null
}

export function parseOutputMessage({
  message,
  webSearch,
  fileSearch,
}: {
  message: ResponseOutputMessage
  webSearch: Map<string, string>
  fileSearch: Map<string, string>
}) {
  const builtinTool = getOpenAIBuiltinFunctionCallId({
    messageId: message.id,
    webSearch,
    fileSearch,
  })
  if (builtinTool) {
    return {
      id: message.id,
      role: MessageRole.assistant,
      status: message.status,
      content: message.content
        .map((content) => {
          if (!isOutputTextContent(content)) return null

          return {
            type: ContentType.toolCall,
            toolCallId: builtinTool.toolId,
            toolName: builtinTool.toolName,
            toolArguments: {
              text: content.text,
              annotations: content.annotations,
            },
          } satisfies ToolCallContent
        })
        .filter((c) => c !== null),
    } satisfies AssistantMessage
  }

  return {
    id: message.id,
    role: MessageRole.assistant,
    status: message.status,
    content: message.content.map((content) => {
      if (isOutputTextContent(content)) {
        return {
          type: ContentType.text,
          annotations: content.annotations,
          text: content.text,
        } satisfies TextContent
      }

      if (isOutputRefusalContent(content)) {
        return {
          type: ContentType.text,
          text: content.refusal,
        } satisfies TextContent
      }

      // @ts-expect-error - Should not happen
      const type = content.type
      throw new Error(
        `Unknown type ${type} in OpenAIResponse message output content`,
      )
    }),
  } satisfies PromptlMessage
}
