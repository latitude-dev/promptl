import {
  isBlockedMemberKey,
  isCallableMember,
  MEMBER_EXPRESSION_METHOD,
} from '$promptl/compiler/logic/operators'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$promptl/compiler/logic/types'
import errors from '$promptl/error/errors'
import type { Identifier, MemberExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### MemberExpression
 * Represents a property from an object. If the property does not exist in the object, it will return undefined.
 */
export async function resolve({
  node,
  ...props
}: ResolveNodeProps<MemberExpression>) {
  const object = await resolveLogicNode({
    node: node.object,
    ...props,
  })

  // Accessing to the property can be optional (?.)
  if (object == null && node.optional) return undefined

  const property = node.computed
    ? await resolveLogicNode({
        node: node.property,
        ...props,
      })
    : (node.property as Identifier).name

  if (isBlockedMemberKey(property)) {
    props.raiseError(errors.forbiddenPropertyAccess(String(property)), node)
  }

  const value = MEMBER_EXPRESSION_METHOD(object, property)
  if (typeof value === 'function' && !isCallableMember(object, property)) {
    props.raiseError(errors.forbiddenFunctionCall(String(property)), node)
  }
  return value
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<MemberExpression>) {
  if (
    !node.computed &&
    isBlockedMemberKey((node.property as Identifier).name)
  ) {
    props.raiseError(
      errors.forbiddenPropertyAccess((node.property as Identifier).name),
      node,
    )
  }
  updateScopeContextForNode({ node: node.object, ...props })
  if (node.computed) {
    updateScopeContextForNode({ node: node.property, ...props })
  }
}
