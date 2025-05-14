import {
  MessageInputItem,
  ToolCallRequest,
  ToolCallResponse,
} from '$promptl/providers/openai-responses/types'
import {
  AssistantMessage,
  ContentType,
  MessageRole,
  ToolMessage,
} from '$promptl/types'

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
    role: MessageRole.assistant,
    id: message.id,
    status: message.status,
    content: [
      {
        type: ContentType.toolCall,
        toolCallId: message.call_id,
        toolName: message.name,
        toolArguments: JSON.parse(message.arguments),
      },
    ],
  } satisfies AssistantMessage
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
    role: MessageRole.tool,
    toolId: message.call_id,
    toolName: toolNameMap.get(message.call_id) ?? message.call_id,
    content: [
      {
        type: ContentType.text,
        text: message.output,
      },
    ],
    // Optional
    status: message.status,
    id: message.id,
  } satisfies ToolMessage
}
