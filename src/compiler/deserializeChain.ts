import { Chain } from '$promptl/compiler/chain'
import Scope from '$promptl/compiler/scope'
import { AdapterKey, Adapters, ProviderAdapter } from '$promptl/providers'
import { Message } from '$promptl/types'

type SerializedChain = ReturnType<Chain['serialize']>

function getAdapter<M extends Message>(adapterType: AdapterKey) {
  const adapter = Adapters[adapterType]

  if (!adapter) throw new Error(`Adapter not found: ${adapterType}`)

  return adapter as ProviderAdapter<M>
}

function safeSerializedData(data: string | SerializedChain): SerializedChain {
  try {
    const serialized =
      typeof data === 'string'
        ? JSON.parse(data)
        : typeof data === 'object'
          ? data
          : {}
    const compilerOptions = serialized.compilerOptions || {}

    if (
      typeof serialized !== 'object' ||
      typeof serialized.ast !== 'object' ||
      typeof serialized.scope !== 'object' ||
      typeof serialized.adapterType !== 'string'
    ) {
      throw new Error()
    }
    return { ...serialized, compilerOptions }
  } catch {
    throw new Error('Invalid serialized chain data')
  }
}

export type SerializedProps = { serialized: string | SerializedChain }
export function deserializeChain({ serialized }: SerializedProps): Chain {
  const {
    ast,
    scope: serializedScope,
    adapterType,
    compilerOptions,
  } = safeSerializedData(serialized)
  const adapter = getAdapter(adapterType)
  const scope = new Scope()
  scope.setStash(serializedScope.stash)
  scope.setPointers(serializedScope.pointers)

  return new Chain({
    prompt: '',
    serialized: { ast, scope },
    adapter,
    ...compilerOptions,
  })
}
