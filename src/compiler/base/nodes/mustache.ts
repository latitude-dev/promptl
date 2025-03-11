import { MustacheTag } from '$promptl/parser/interfaces'
import {
  ContentType,
  isPromptLFile,
  MessageContent,
  PromptLFile,
} from '$promptl/types'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  addStrayText,
  groupStrayText,
  isInsideContentTag,
  addContent,
  resolveExpression,
}: CompileNodeContext<MustacheTag>) {
  const expression = node.expression
  const value = await resolveExpression(expression, scope)
  if (value === undefined) return

  if (isPromptLFile(value)) {
    if (isInsideContentTag) {
      addStrayText(String(value.url), node)
      return
    }

    groupStrayText()

    addContent({
      node,
      content: getPromptLFileContent(value),
    })

    return
  }

  if (typeof value === 'object' && value !== null) {
    addStrayText(JSON.stringify(value), node)
    return
  }

  addStrayText(String(value), node)
}

function getPromptLFileContent(file: PromptLFile): MessageContent {
  if (file.isImage) {
    return {
      type: ContentType.image,
      image: file.url!,
    }
  }

  return {
    type: ContentType.file,
    mimeType: file.mimeType,
    file: file.url!,
  }
}
