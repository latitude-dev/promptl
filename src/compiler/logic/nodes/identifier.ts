import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$promptl/compiler/logic/types'
import errors from '$promptl/error/errors'
import type { Identifier } from 'estree'

/**
 * ### Identifier
 * Represents a variable from the scope.
 */
export async function resolve({
  node,
  scope,
  builtins,
}: ResolveNodeProps<Identifier>) {
  if (node.name in builtins) {
    return builtins[node.name]!()
  }
  if (!scope.exists(node.name)) {
    return undefined
  }
  return scope.get(node.name)
}

export function updateScopeContext({
  node,
  scopeContext,
  builtins,
  raiseError,
}: UpdateScopeContextProps<Identifier>) {
  if (node.name in builtins) {
    return
  }
  if (!scopeContext.definedVariables.has(node.name)) {
    if (scopeContext.onlyPredefinedVariables === undefined) {
      scopeContext.usedUndefinedVariables.add(node.name)
      return
    }
    if (!scopeContext.onlyPredefinedVariables.has(node.name)) {
      raiseError(errors.variableNotDefined(node.name), node)
    }
  }
}
