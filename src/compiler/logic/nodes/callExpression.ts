import {
  isBlockedCallable,
  isBlockedMemberKey,
  isCallableMember,
} from '$promptl/compiler/logic/operators'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$promptl/compiler/logic/types'
import CompileError from '$promptl/error/error'
import errors from '$promptl/error/errors'
import type { Identifier, SimpleCallExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### CallExpression
 * Represents a method call.
 *
 * Examples: `foo()` `foo.bar()`
 */
export async function resolve(props: ResolveNodeProps<SimpleCallExpression>) {
  const { node, raiseError } = props

  let callee = node.callee
  if (callee.type === 'ChainExpression') callee = callee.expression

  if (callee.type === 'MemberExpression') {
    const member = callee
    const object = await resolveLogicNode({ ...props, node: member.object })

    if (object == null && member.optional) return undefined

    const key = member.computed
      ? await resolveLogicNode({ ...props, node: member.property })
      : (member.property as Identifier).name

    if (isBlockedMemberKey(key)) {
      raiseError(errors.forbiddenPropertyAccess(String(key)), node)
    }

    if (object == null) {
      raiseError(errors.notAFunction(String(object)), node)
    }

    const method = (object as any)[key as PropertyKey]
    if (typeof method !== 'function') {
      raiseError(errors.notAFunction(typeof method), node)
    }
    if (isBlockedCallable(method)) {
      raiseError(errors.forbiddenFunctionCall(String(key)), node)
    }
    if (!isCallableMember(object, key)) {
      raiseError(errors.forbiddenFunctionCall(String(key)), node)
    }

    const args = await resolveArgs(props)
    return await runMethod({
      ...props,
      method: (method as Function).bind(object),
      args,
    })
  }

  const method = (await resolveLogicNode({
    ...props,
    node: node.callee,
  })) as Function
  if (typeof method !== 'function') {
    raiseError(errors.notAFunction(typeof method), node)
  }
  if (isBlockedCallable(method)) {
    raiseError(errors.forbiddenFunctionCall('function'), node)
  }
  const args = await resolveArgs(props)
  return await runMethod({ ...props, method, args })
}

function resolveArgs(
  props: ResolveNodeProps<SimpleCallExpression>,
): Promise<unknown[]> {
  const { node } = props
  return Promise.all(
    node.arguments.map((arg) =>
      resolveLogicNode({
        ...props,
        node: arg,
      }),
    ),
  )
}

async function runMethod({
  method,
  args,
  node,
  raiseError,
}: ResolveNodeProps<SimpleCallExpression> & {
  method: Function
  args: unknown[]
}) {
  try {
    return await method(...args)
  } catch (error: unknown) {
    if (error instanceof CompileError) throw error
    raiseError(errors.functionCallError(error), node)
  }
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<SimpleCallExpression>) {
  updateScopeContextForNode({ node: node.callee, ...props })
  for (const arg of node.arguments) {
    updateScopeContextForNode({ node: arg, ...props })
  }
}
