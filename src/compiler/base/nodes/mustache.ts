import errors from '$promptl/error/errors'
import { MustacheTag } from '$promptl/parser/interfaces'
import {
  isPromptLFile,
  PromptLFile,
  promptLFileToMessageContent,
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
  baseNodeError,
}: CompileNodeContext<MustacheTag>) {
  const expression = node.expression
  const value = await resolveExpression(expression, scope)
  if (value === undefined) return

  const files = promptLFileArray(value)
  if (files) {
    if (isInsideContentTag) {
      if (files.length > 1) {
        baseNodeError(errors.multipleFilesInContentTag, node)
        return
      }

      const file = files[0]!
      addStrayText(String(file.url), node)
      return
    }

    groupStrayText()

    files.forEach((file) => {
      addContent({
        node,
        content: promptLFileToMessageContent(file),
      })
    })

    return
  }

  if (typeof value === 'object' && value !== null) {
    addStrayText(JSON.stringify(value), node)
    return
  }

  addStrayText(String(value), node)
}

function promptLFileArray(value: unknown): PromptLFile[] | undefined {
  if (isPromptLFile(value)) return [value]
  if (Array.isArray(value) && value.length && value.every(isPromptLFile)) {
    return value
  }
  return undefined
}
