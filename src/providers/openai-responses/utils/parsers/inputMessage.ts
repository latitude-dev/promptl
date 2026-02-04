import {
  MessageInputItem,
  ResponseInputMessage,
} from '$promptl/providers/openai-responses/types'
import { parseSimpleContent } from '$promptl/providers/openai-responses/utils/parsers/parseSimpleContent'
import { DeveloperMessage, SystemMessage, UserMessage } from '$promptl/types'

type InputMessageRole = ResponseInputMessage['role']

type PromptlMessage = SystemMessage | DeveloperMessage | UserMessage
function fromOpenAIRoleToPromptlRole(role: InputMessageRole) {
  return role
}

export function isInputMessage(
  message: MessageInputItem,
): message is ResponseInputMessage {
  return (
    message.type === 'message' &&
    message.role !== 'assistant' &&
    typeof message.content !== 'string'
  )
}

export function parseInputMessage(message: ResponseInputMessage) {
  return {
    role: fromOpenAIRoleToPromptlRole(message.role),
    status: message.status,
    content: message.content.map(parseSimpleContent),
  } as PromptlMessage
}
