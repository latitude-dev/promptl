import { removeCommonIndent } from '$promptl/compiler/utils'
import { CUSTOM_CONTENT_TYPE_ATTR, TAG_NAMES } from '$promptl/constants'
import errors from '$promptl/error/errors'
import { ContentTag } from '$promptl/parser/interfaces'
import { ContentType, ContentTypeTagName } from '$promptl/types'

import { CompileNodeContext } from '../../types'

export async function compile(
  {
    node,
    scope,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    fullPath,
    resolveBaseNode,
    baseNodeError,
    popStrayText,
    addContent,
  }: CompileNodeContext<ContentTag>,
  attributes: Record<string, unknown>,
) {
  if (isInsideContentTag) {
    baseNodeError(errors.contentTagInsideContent, node)
  }

  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideStepTag,
      isInsideMessageTag,
      isInsideContentTag: true,
      fullPath,
    })
  }
  const textContent = removeCommonIndent(popStrayText())

  let type: ContentType
  if (node.name === TAG_NAMES.content) {
    if (attributes[CUSTOM_CONTENT_TYPE_ATTR] === undefined) {
      baseNodeError(errors.messageTagWithoutRole, node)
    }
    type = attributes[CUSTOM_CONTENT_TYPE_ATTR] as ContentType
    delete attributes[CUSTOM_CONTENT_TYPE_ATTR]
  } else {
    const contentTypeKeysFromTagName = Object.fromEntries(
      Object.entries(ContentTypeTagName).map(([k, v]) => [v, k]),
    )
    type =
      ContentType[
        contentTypeKeysFromTagName[node.name] as keyof typeof ContentType
      ]
  }

  if (type === ContentType.text) {
    addContent({
      node,
      content: {
        ...attributes,
        type: ContentType.text,
        text: textContent,
      },
    })
    return
  }

  if (type === ContentType.image) {
    addContent({
      node,
      content: {
        ...attributes,
        type: ContentType.image,
        image: textContent,
      },
    })
    return
  }

  if (type == ContentType.toolCall) {
    const { id, name, ...rest } = attributes
    if (!id) baseNodeError(errors.toolCallTagWithoutId, node)
    if (!name) baseNodeError(errors.toolCallWithoutName, node)

    let toolArguments = rest['arguments']
    delete rest['arguments']
    if (toolArguments && typeof toolArguments === 'string') {
      try {
        rest['arguments'] = JSON.parse(toolArguments)
      } catch (e) {
        baseNodeError(errors.invalidToolCallArguments, node)
      }
    }

    addContent({
      node,
      content: {
        ...rest,
        type: ContentType.toolCall,
        toolCallId: String(id),
        toolName: String(name),
        toolArguments: (toolArguments ?? {}) as Record<string, unknown>,
      },
    })
    return
  }

  baseNodeError(errors.invalidContentType(type), node)
}
