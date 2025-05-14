import {
  MessageInputItem,
  WebSearchCall,
} from '$promptl/providers/openai-responses/types'
import {
  AssistantMessage,
  ContentType,
  MessageRole,
  ToolCallContent,
} from '$promptl/types'

export function isWebsearchCall(
  message: MessageInputItem,
): message is WebSearchCall {
  return message.type === 'web_search_call'
}

export function parseWebsearchCall({
  message: inputMessage,
  webSearch,
}: {
  message: WebSearchCall
  webSearch: Map<string, string>
}) {
  const callId = inputMessage.id.replace(/^ws_/, '')
  webSearch.set(callId, callId)

  return {
    role: MessageRole.assistant,
    id: inputMessage.id,
    status: inputMessage.status,
    content: [
      {
        type: ContentType.toolCall,
        toolCallId: callId,
        toolName: inputMessage.type,
        toolArguments: {},
      } satisfies ToolCallContent,
    ],
  } satisfies AssistantMessage
}
