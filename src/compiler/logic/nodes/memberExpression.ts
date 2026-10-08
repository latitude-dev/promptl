import {
  isBlockedCallable,
  isBlockedMemberKey,
  isCallableMember,
  MEMBER_EXPRESSION_METHOD,
  normalizeMemberKey,
} from '$promptl/compiler/logic/operators'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$promptl/compiler/logic/types'
import errors from '$promptl/error/errors'
import type { Identifier, MemberExpression } from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * Resolve a member key to a single normalized string. Computed keys must already be a
 * string or number; every other type is rejected so a key object cannot coerce twice.
 */
export function resolveNormalizedMemberKey(
  raw: unknown,
  computed: boolean,
  raiseError: ResolveNodeProps<MemberExpression>['raiseError'],
  node: MemberExpression,
): string {
  if (!computed) return raw as string

  const key = normalizeMemberKey(raw)
  if (key === undefined) {
    return raiseError(errors.invalidMemberKey, node)
  }
  return key
}

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

  const raw = node.computed
    ? await resolveLogicNode({
        node: node.property,
        ...props,
      })
    : (node.property as Identifier).name

  const property = resolveNormalizedMemberKey(
    raw,
    node.computed,
    props.raiseError,
    node,
  )

  if (isBlockedMemberKey(property)) {
    props.raiseError(errors.forbiddenPropertyAccess(property), node)
  }

  // Read the unbound value first so blocked callables are caught before bind.
  const unbound = (object as any)[property]
  if (typeof unbound === 'function') {
    if (isBlockedCallable(unbound)) {
      props.raiseError(errors.forbiddenFunctionCall(property), node)
    }
    if (!isCallableMember(object, property)) {
      props.raiseError(errors.forbiddenFunctionCall(property), node)
    }
  }

  return MEMBER_EXPRESSION_METHOD(object, property)
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
