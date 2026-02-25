import { hasContent, isIterable } from '$promptl/compiler/utils'
import errors from '$promptl/error/errors'
import { ForBlock, TemplateNode } from '$promptl/parser/interfaces'

import { CompileNodeContext, TemplateNodeWithStatus } from '../types'

type ForNodeWithStatus = TemplateNodeWithStatus & {
  status: TemplateNodeWithStatus['status'] & {
    loopIterationIndex: number
    loopInvocationCount: number
  }
}

function clearNodeStatus(node: TemplateNode): void {
  const n = node as TemplateNodeWithStatus
  if (n.status) {
    delete n.status.completedAs
    delete n.status.scopePointers
  }
  if (node.children) {
    for (const child of node.children) {
      clearNodeStatus(child)
    }
  }
  if ('else' in node && node.else?.children) {
    for (const child of node.else.children) {
      clearNodeStatus(child)
    }
  }
}

export async function compile({
  node,
  scope,
  isInsideStepTag,
  isInsideContentTag,
  isInsideMessageTag,
  resolveBaseNode,
  resolveExpression,
  expressionError,
  fullPath,
}: CompileNodeContext<ForBlock>) {
  const nodeWithStatus = node as ForNodeWithStatus
  nodeWithStatus.status = {
    ...nodeWithStatus.status,
    scopePointers: scope.getPointers(),
  }

  const iterableElement = await resolveExpression(node.expression, scope)
  if (!isIterable(iterableElement) || !(await hasContent(iterableElement))) {
    const childScope = scope.copy()
    for await (const childNode of node.else?.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope: childScope,
        isInsideStepTag,
        isInsideMessageTag,
        isInsideContentTag,
        fullPath,
      })
    }
    return
  }

  const contextVarName = node.context.name
  const indexVarName = node.index?.name
  if (scope.exists(contextVarName)) {
    throw expressionError(
      errors.variableAlreadyDeclared(contextVarName),
      node.context,
    )
  }

  if (indexVarName && scope.exists(indexVarName)) {
    throw expressionError(
      errors.variableAlreadyDeclared(indexVarName),
      node.index!,
    )
  }

  const invocationCount = nodeWithStatus.status.loopInvocationCount ?? 0
  let i = 0

  for await (const element of iterableElement) {
    if (i < (nodeWithStatus.status.loopIterationIndex ?? 0)) {
      i++
      continue
    }
    nodeWithStatus.status.loopIterationIndex = i

    const localScope = scope.copy()
    localScope.set(contextVarName, element)
    if (indexVarName) localScope.set(indexVarName, i)

    for await (const childNode of node.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope: localScope,
        isInsideStepTag,
        isInsideMessageTag,
        isInsideContentTag,
        fullPath,
        completedValue: `step_${invocationCount}_${i}`,
      })
    }

    i++
  }

  nodeWithStatus.status = {
    ...nodeWithStatus.status,
    loopIterationIndex: 0,
    loopInvocationCount: invocationCount + 1,
  }

  for (const child of node.children ?? []) {
    clearNodeStatus(child)
  }
}
