import { render, scan } from '../compiler'
import { RPC } from './types'

export default {
  [RPC.Procedure.Scan]: async ({ prompt }: { prompt: string }) => {
    return await scan({
      prompt: prompt,
    })
  },

  [RPC.Procedure.Compile]: async ({
    prompt,
    parameters,
  }: {
    prompt: string
    parameters?: Record<string, unknown>
  }) => {
    return await render({
      prompt: prompt,
      parameters: parameters,
    })
  },
} as Record<RPC.Procedure, RPC.Handler<any, Promise<any>>>
