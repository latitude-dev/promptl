import {
  isChainStepTag,
  isContentTag,
  isMessageTag,
  isRefTag,
  isScopeTag,
} from '$promptl/compiler/utils'
import errors from '$promptl/error/errors'
import {
  ChainStepTag,
  ContentTag,
  ElementTag,
  MessageTag,
  ReferenceTag,
  ScopeTag,
} from '$promptl/parser/interfaces'

import { CompileNodeContext } from '../types'
import { compile as resolveContent } from './tags/content'
import { compile as resolveMessage } from './tags/message'
import { compile as resolveRef } from './tags/ref'
import { compile as resolveChainStep } from './tags/step'
import { compile as resolveScope } from './tags/scope'

async function resolveTagAttributes({
  node: tagNode,
  scope,
  resolveExpression,
}: CompileNodeContext<ElementTag>): Promise<Record<string, unknown>> {
  const attributeNodes = tagNode.attributes
  if (attributeNodes.length === 0) return {}

  const attributes: Record<string, unknown> = {}
  for (const attributeNode of attributeNodes) {
    const { name, value } = attributeNode
    if (value === true) {
      attributes[name] = true
      continue
    }

    const accumulatedValue: unknown[] = []
    for await (const node of value) {
      if (node.type === 'Text') {
        if (node.data) {
          accumulatedValue.push(node.data)
        }
        continue
      }

      if (node.type === 'MustacheTag') {
        const expression = node.expression
        const resolvedValue = await resolveExpression(expression, scope)
        if (resolvedValue === undefined) continue
        accumulatedValue.push(resolvedValue)
        continue
      }
    }

    const finalValue =
      accumulatedValue.length > 1
        ? accumulatedValue.map(String).join('')
        : accumulatedValue[0]

    attributes[name] = finalValue
  }

  return attributes
}

export async function compile(props: CompileNodeContext<ElementTag>) {
  const {
    node,
    scope,
    isInsideStepTag,
    isInsideContentTag,
    isInsideMessageTag,
    fullPath,
    resolveBaseNode,
    baseNodeError,
    groupStrayText,
  } = props
  groupStrayText()

  const attributes = await resolveTagAttributes(props)

  if (isContentTag(node)) {
    await resolveContent(props as CompileNodeContext<ContentTag>, attributes)
    return
  }

  if (isMessageTag(node)) {
    await resolveMessage(props as CompileNodeContext<MessageTag>, attributes)
    return
  }

  if (isRefTag(node)) {
    await resolveRef(props as CompileNodeContext<ReferenceTag>, attributes)
    return
  }

  if (isScopeTag(node)) {
    await resolveScope(props as CompileNodeContext<ScopeTag>, attributes)
    return
  }

  if (isChainStepTag(node)) {
    await resolveChainStep(
      props as CompileNodeContext<ChainStepTag>,
      attributes,
    )
    return
  }

  //@ts-ignore - Linter knows there *should* not be another type of tag.
  baseNodeError(errors.unknownTag(node.name), node)

  //@ts-ignore - ditto
  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideStepTag,
      isInsideMessageTag,
      isInsideContentTag,
      fullPath,
    })
  }
}
