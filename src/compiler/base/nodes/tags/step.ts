import { tagAttributeIsLiteral } from '$promptl/compiler/utils'
import errors from '$promptl/error/errors'
import { ChainStepTag } from '$promptl/parser/interfaces'
import { Config, ContentType } from '$promptl/types'

import { CompileNodeContext } from '../../types'

function isValidConfig(value: unknown): value is Config | undefined {
  if (value === undefined) return true
  if (Array.isArray(value)) return false
  return typeof value === 'object'
}

export async function compile(
  {
    node,
    scope,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    fullPath,
    popStepResponse,
    groupContent,
    resolveBaseNode,
    baseNodeError,
    stop,
  }: CompileNodeContext<ChainStepTag>,
  attributes: Record<string, unknown>,
) {
  if (isInsideStepTag) {
    baseNodeError(errors.stepTagInsideStep, node)
  }

  const stepResponse = popStepResponse()

  const { as: responseVarName, raw: messageVarName, ...config } = attributes

  // The step must be processed.
  if (stepResponse === undefined) {
    if (!isValidConfig(config)) {
      baseNodeError(errors.invalidStepConfig, node)
    }

    for await (const childNode of node.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope,
        isInsideStepTag: true,
        isInsideMessageTag,
        isInsideContentTag,
        fullPath,
      })
    }

    // Stop the compiling process up to this point.
    stop(config as Config)
  }

  // The step has already been process, this is the continuation of the chain.

  if ('raw' in attributes) {
    if (!tagAttributeIsLiteral(node, 'raw')) {
      baseNodeError(errors.invalidStaticAttribute('raw'), node)
    }

    scope.set(String(messageVarName), stepResponse)
  }

  if ('as' in attributes) {
    if (!tagAttributeIsLiteral(node, 'as')) {
      baseNodeError(errors.invalidStaticAttribute('as'), node)
    }

    const textResponse = (stepResponse?.content ?? []).filter(c => c.type === ContentType.text).map(c => c.text).join('')
    let responseVarValue = textResponse

    if ("schema" in config) {
      try {
        responseVarValue = JSON.parse(responseVarValue.trim())
      } catch (error) {
        baseNodeError(errors.functionCallError(error), node)
      }
    }

    scope.set(String(responseVarName), responseVarValue)
  }

  groupContent()
}
