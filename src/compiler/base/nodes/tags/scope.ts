import Scope from '$promptl/compiler/scope'
import { ScopeTag } from '$promptl/parser/interfaces'

import { CompileNodeContext } from '../../types'

export async function compile(
  props: CompileNodeContext<ScopeTag>,
  attributes: Record<string, unknown>,
) {
  const {
    node,
    resolveBaseNode,
  } = props

  const childScope = new Scope(attributes)

  for await (const childNode of node.children) {
    await resolveBaseNode({
      ...props,
      node: childNode,
      scope: childScope,
    })
  }
}
