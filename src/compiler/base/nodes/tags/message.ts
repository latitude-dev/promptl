import { CUSTOM_MESSAGE_ROLE_ATTR, TAG_NAMES } from '$promptl/constants'
import errors from '$promptl/error/errors'
import { MessageTag, TemplateNode } from '$promptl/parser/interfaces'
import { Message, MessageContent } from '$promptl/types'
import type { MessageRole, ToolResultContent } from '$promptl/types'

import { CompileNodeContext } from '../../types'

export async function compile(
  props: CompileNodeContext<MessageTag>,
  attributes: Record<string, unknown>,
) {
  const {
    node,
    scope,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    fullPath,
    resolveBaseNode,
    baseNodeError,
    groupContent,
    groupStrayText,
    popContent,
    addMessage,
  } = props

  if (isInsideContentTag || isInsideMessageTag) {
    baseNodeError(errors.messageTagInsideMessage, node)
  }

  groupContent()

  let role = node.name as MessageRole
  if (node.name === TAG_NAMES.message) {
    if (attributes[CUSTOM_MESSAGE_ROLE_ATTR] === undefined) {
      baseNodeError(errors.messageTagWithoutRole, node)
    }
    role = attributes[CUSTOM_MESSAGE_ROLE_ATTR] as MessageRole
    delete attributes[CUSTOM_MESSAGE_ROLE_ATTR]
  }

  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideStepTag,
      isInsideMessageTag: true,
      isInsideContentTag,
      fullPath,
    })
  }

  groupStrayText()
  const content = popContent()

  const message = buildMessage(props as CompileNodeContext<MessageTag>, {
    role,
    attributes,
    content,
  })!
  addMessage(message)
}

type BuildProps<R extends MessageRole> = {
  role: R
  attributes: Record<string, unknown>
  content: { node?: TemplateNode; content: MessageContent }[]
}

function buildMessage<R extends MessageRole>(
  { node, baseNodeError }: CompileNodeContext<MessageTag>,
  { role, attributes, content }: BuildProps<R>,
): Message | undefined {
  if (!['assistant', 'developer', 'system', 'tool', 'user'].includes(role)) {
    baseNodeError(errors.invalidMessageRole(role), node)
  }

  if (role !== 'assistant') {
    content.forEach((item) => {
      if (item.content.type === 'tool-call') {
        baseNodeError(errors.invalidToolCallPlacement, item.node ?? node)
      }
    })
  }

  const message = {
    ...attributes,
    role,
    content: content.map((item) => item.content),
  } as Message

  if (role === 'tool') {
    if (attributes.id === undefined) {
      baseNodeError(errors.toolMessageWithoutId, node)
    }

    if (attributes.name === undefined) {
      baseNodeError(errors.toolMessageWithoutName, node)
    }

    const toolResult: ToolResultContent = {
      type: 'tool-result',
      toolCallId: String(attributes.id),
      toolName: String(attributes.name),
      result: message.content,
    }
    message.content = [toolResult]
    delete (message as Record<string, unknown>)['id']
    delete (message as Record<string, unknown>)['name']
  }

  return message
}
