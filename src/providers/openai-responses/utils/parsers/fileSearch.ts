import {
  FileSearchCall,
  MessageInputItem,
} from '$promptl/providers/openai-responses/types'
import {
  AssistantMessage,
  ContentType,
  MessageRole,
  ToolCallContent,
} from '$promptl/types'

export function isFileSearchCall(
  message: MessageInputItem,
): message is FileSearchCall {
  return message.type === 'file_search_call'
}

export function parseFileSearch({
  message,
  fileSearch,
}: {
  message: FileSearchCall
  fileSearch: Map<string, string>
}) {
  const callId = message.id.replace(/^fs_/, '')
  fileSearch.set(callId, callId)
  return {
    role: MessageRole.assistant,
    id: message.id,
    status: message.status,
    content: [
      {
        type: ContentType.toolCall,
        toolCallId: callId,
        toolName: message.type,
        toolArguments: {
          queries: message.queries,
          results: message.results,
        },
      } satisfies ToolCallContent,
    ],
  } satisfies AssistantMessage
}
