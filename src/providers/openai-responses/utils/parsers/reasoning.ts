import { MessageInputItem } from '$promptl/providers/openai-responses/types'
import { Message as PromptlMessage } from '$promptl/types'
import { ResponseReasoningItem } from 'openai/resources/responses/responses'

export function isReasoning(
  message: MessageInputItem,
): message is ResponseReasoningItem {
  return message.type === 'reasoning'
}

export function parseReasoning(message: ResponseReasoningItem) {
  return {
    id: message.id,
    role: 'assistant',
    content: message.summary.map((summary) => ({
      type: 'text',
      text: summary.text,
    })),
    status: message.status,
    encrypted_content: message.encrypted_content,
  } as PromptlMessage
}
