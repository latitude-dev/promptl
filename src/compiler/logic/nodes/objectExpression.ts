import {
  resolveLogicNode,
  updateScopeContextForNode,
} from '$promptl/compiler/logic'
import { normalizeMemberKey } from '$promptl/compiler/logic/operators'
import {
  UpdateScopeContextProps,
  type ResolveNodeProps,
} from '$promptl/compiler/logic/types'
import errors from '$promptl/error/errors'
import { type Identifier, type Literal, type ObjectExpression } from 'estree'

// Defines an own data property, so a key such as `__proto__` never triggers the prototype setter.
function defineOwn(object: object, key: string, value: unknown) {
  Object.defineProperty(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

function literalKey(node: Literal): string | undefined {
  const value = node.value
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

/**
 * ### ObjectExpression
 * Represents a javascript Object
 */
export async function resolve({
  node,
  scope,
  raiseError,
  ...props
}: ResolveNodeProps<ObjectExpression>) {
  const resolvedObject: { [key: string]: any } = {}
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      const spreadObject = await resolveLogicNode({
        node: prop.argument,
        scope,
        raiseError,
        ...props,
      })
      if (typeof spreadObject !== 'object') {
        raiseError(errors.invalidSpreadInObject(typeof spreadObject), prop)
      }
      Object.entries(spreadObject as object).forEach(([key, value]) => {
        defineOwn(resolvedObject, key, value)
      })
      continue
    }
    if (prop.type === 'Property') {
      let key: string | undefined
      if (prop.computed) {
        const raw = await resolveLogicNode({
          node: prop.key,
          scope,
          raiseError,
          ...props,
        })
        key = normalizeMemberKey(raw)
        if (key === undefined) {
          return raiseError(errors.invalidMemberKey, prop)
        }
      } else if (prop.key.type === 'Identifier') {
        key = (prop.key as Identifier).name
      } else if (prop.key.type === 'Literal') {
        key = literalKey(prop.key as Literal)
        if (key === undefined) {
          raiseError(errors.invalidObjectKey, prop)
        }
      } else {
        raiseError(errors.invalidObjectKey, prop)
      }

      if (key === undefined) {
        return raiseError(errors.invalidObjectKey, prop)
      }

      const value = await resolveLogicNode({
        node: prop.value,
        scope,
        raiseError,
        ...props,
      })
      defineOwn(resolvedObject, key, value)
      continue
    }
    throw raiseError(errors.invalidObjectKey, prop)
  }
  return resolvedObject
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<ObjectExpression>) {
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      updateScopeContextForNode({ node: prop.argument, ...props })
      continue
    }
    if (prop.type === 'Property') {
      if (prop.computed) {
        updateScopeContextForNode({ node: prop.key, ...props })
      }
      updateScopeContextForNode({ node: prop.value, ...props })
      continue
    }
    props.raiseError(errors.invalidObjectKey, prop)
  }
}
