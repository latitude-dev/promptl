import { describe, expect, it } from 'vitest'

import { removeCommonIndent } from './utils'
import { Adapters } from '$promptl/providers'
import { Chain } from './chain'

describe('deserialize chain', async () => {
  it('get final step from serialized chain', async () => {
    const prompt = removeCommonIndent(`
      <step>
        {{foo = 5}}
      </step>
      <step>
        {{foo += 1}}
      </step>
      <step>
        <assistant>
          The final result is {{foo}}
        </assistant>
      </step>
    `)

    const chain = new Chain({ prompt, adapter: Adapters.openai })

    await chain.step()
    await chain.step('First step response')
    const serializedChain = chain.serialize()
    const serialized = JSON.stringify(serializedChain)

    // In another context we deserialize existing chain
    const deserializedChain = Chain.deserialize({ serialized })
    const { messages } = await deserializedChain!.step('Last step')
    expect(messages[messages.length - 1]).toEqual({
      role: 'assistant',
      tool_calls: undefined,
      content: [{ text: 'The final result is 6', type: 'text' }],
    })
  })
})
