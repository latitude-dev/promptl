import {
  FileSearchCall,
  MessageInputItem,
} from '$promptl/providers/openai-responses/types'
import { Message as PromptlMessage, ToolRequestContent } from '$promptl/types'

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
    role: 'assistant',
    id: message.id,
    status: message.status,
    content: [
      {
        type: 'tool-call',
        toolCallId: callId,
        toolName: message.type,
        args: {
          queries: message.queries,
          results: message.results,
        },
      } satisfies ToolRequestContent,
    ],
  } as PromptlMessage
}
