import {
  MessageInputItem,
  WebSearchCall,
} from '$promptl/providers/openai-responses/types'
import { Message as PromptlMessage, ToolRequestContent } from '$promptl/types'

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
    role: 'assistant',
    id: inputMessage.id,
    status: inputMessage.status,
    content: [
      {
        type: 'tool-call',
        toolCallId: callId,
        toolName: inputMessage.type,
        args: {},
      } satisfies ToolRequestContent,
    ],
  } as PromptlMessage
}
