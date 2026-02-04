import {
  MessageInputItem,
  ToolCallRequest,
  ToolCallResponse,
} from '$promptl/providers/openai-responses/types'
import { Message as PromptlMessage } from '$promptl/types'

export function isFunctionCall(
  message: MessageInputItem,
): message is ToolCallRequest {
  return message.type === 'function_call'
}

export function isFunctionCallOutput(
  message: MessageInputItem,
): message is ToolCallResponse {
  return message.type === 'function_call_output'
}

export function parseFunctionCall(message: ToolCallRequest) {
  return {
    role: 'assistant',
    id: message.id,
    status: message.status,
    content: [
      {
        type: 'tool-call',
        toolCallId: message.call_id,
        toolName: message.name,
        args: JSON.parse(message.arguments),
      },
    ],
  } as PromptlMessage
}

export function parseFunctionCallOutput({
  message,
  toolNameMap,
}: {
  message: ToolCallResponse
  toolNameMap: Map<string, string>
}) {
  // Tool name map should include the name for this tool response
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: message.call_id,
        toolName: toolNameMap.get(message.call_id) ?? message.call_id,
        result: message.output,
      },
    ],
    // Optional
    status: message.status,
    id: message.id,
  } as PromptlMessage
}
