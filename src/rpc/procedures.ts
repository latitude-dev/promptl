import { render, scan, SerializedChain } from '../compiler'
import { Chain, StepResponse } from '../compiler/chain'
import { AdapterKey, getAdapter } from '../providers'
import { Message, MessageRole } from '../types'
import { RPC } from './types'

export default {
  [RPC.Procedure.ScanPrompt]: async ({ prompt }: { prompt: string }) => {
    const result = await scan({
      prompt: prompt,
    })

    return {
      hash: result.hash,
      resolvedPrompt: result.resolvedPrompt,
      config: result.config,
      errors: result.errors,
      parameters: Array.from(result.parameters),
      isChain: result.isChain,
      includedPromptPaths: Array.from(result.includedPromptPaths),
    }
  },

  [RPC.Procedure.RenderPrompt]: async ({
    prompt,
    parameters,
    adapter,
    defaultRole,
    includeSourceMap,
  }: {
    prompt: string
    parameters?: Record<string, unknown>
    adapter?: AdapterKey
    defaultRole?: MessageRole
    includeSourceMap?: boolean
  }) => {
    const result = await render({
      prompt: prompt,
      parameters: parameters,
      adapter: adapter ? getAdapter(adapter) : undefined,
      defaultRole: defaultRole,
      includeSourceMap: includeSourceMap,
    })

    return {
      messages: result.messages,
      config: result.config,
    }
  },

  [RPC.Procedure.CreateChain]: async ({
    prompt,
    parameters,
    adapter,
    defaultRole,
    includeSourceMap,
  }: {
    prompt: string
    parameters?: Record<string, unknown>
    adapter?: AdapterKey
    defaultRole?: MessageRole
    includeSourceMap?: boolean
  }) => {
    return new Chain({
      prompt: prompt,
      parameters: parameters,
      adapter: adapter ? getAdapter(adapter) : undefined,
      defaultRole: defaultRole,
      includeSourceMap: includeSourceMap,
    }).serialize()
  },

  [RPC.Procedure.StepChain]: async ({
    chain: fromChain,
    response,
  }: {
    chain: SerializedChain
    response?: StepResponse<Message>
  }) => {
    const chain = Chain.deserialize({ serialized: fromChain })!
    const result = await chain.step(response)

    return {
      chain: chain.serialize(),
      messages: result.messages,
      config: result.config,
      completed: result.completed,
    }
  },
} as Record<RPC.Procedure, RPC.Handler<any, Promise<any>>>
