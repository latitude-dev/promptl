import { SerializedChain } from '$promptl/compiler'
import { Chain } from '$promptl/compiler/chain'
import Scope from '$promptl/compiler/scope'
import { getAdapter } from '$promptl/providers'

function safeSerializedData(data: string | SerializedChain): SerializedChain {
  try {
    const serialized =
      typeof data === 'string'
        ? JSON.parse(data)
        : typeof data === 'object'
          ? data
          : {}

    const compilerOptions = serialized.compilerOptions || {}
    const globalConfig = serialized.globalConfig
    const globalMessages = serialized.globalMessages || []

    if (
      typeof serialized !== 'object' ||
      typeof serialized.ast !== 'object' ||
      typeof serialized.scope !== 'object' ||
      typeof serialized.didStart !== 'boolean' ||
      typeof serialized.completed !== 'boolean' ||
      typeof serialized.adapterType !== 'string' ||
      typeof serialized.rawText !== 'string'
    ) {
      throw new Error()
    }
    return {
      rawText: serialized.rawText,
      ast: serialized.ast,
      scope: serialized.scope,
      didStart: serialized.didStart,
      completed: serialized.completed,
      adapterType: serialized.adapterType,
      compilerOptions,
      globalConfig,
      globalMessages,
    }
  } catch {
    throw new Error('Invalid serialized chain data')
  }
}

export type SerializedProps = {
  serialized: string | SerializedChain | undefined | null
}
export function deserializeChain({
  serialized,
}: SerializedProps): Chain | undefined {
  if (!serialized) return undefined

  const {
    rawText,
    ast,
    scope: serializedScope,
    didStart,
    completed,
    adapterType,
    compilerOptions,
    globalConfig,
    globalMessages,
  } = safeSerializedData(serialized)

  const adapter = getAdapter(adapterType)
  const scope = new Scope()
  scope.setStash(serializedScope.stash)
  scope.setPointers(serializedScope.pointers)

  return new Chain({
    prompt: rawText,
    serialized: {
      ast,
      scope,
      didStart,
      completed,
      globalConfig,
      globalMessages,
    },
    adapter,
    ...compilerOptions,
  })
}
