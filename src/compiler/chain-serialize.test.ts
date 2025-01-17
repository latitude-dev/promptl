import { getExpectedError } from '$promptl/test/helpers'
import { describe, expect, it } from 'vitest'

import { Chain } from './chain'
import { removeCommonIndent } from './utils'
import { Adapters } from '$promptl/providers'
import { MessageRole } from '$promptl/types'

describe('serialize chain', async () => {
  it('fails when trying to serialize without running step', async () => {
    const prompt = removeCommonIndent(`
      <step>
        Before step
      </step>
      <step>
        After step
      </step>
    `)

    const chain = new Chain({ prompt, adapter: Adapters.default })

    const action = () => chain.serialize()
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe(
      'The chain has not started yet. You must call `step` at least once before calling `serialize`.',
    )
  })

  it('serialize with single step', async () => {
    const prompt = removeCommonIndent(`
      ---
      provider: OpenAI_PATATA
      model: gpt-4
      ---
      {{ foo = 'foo' }}
      A message
    `)

    const chain = new Chain({
      prompt: removeCommonIndent(prompt),
      parameters: {},
      adapter: Adapters.default,
    })
    await chain.step()
    const serialized = chain.serialize()
    expect(serialized).toEqual({
      rawText: prompt,
      scope: {
        pointers: { foo: 0 },
        stash: ['foo'],
      },
      adapterType: 'default',
      compilerOptions: {},
      globalConfig: {
        provider: 'OpenAI_PATATA',
        model: 'gpt-4',
      },
      ast: expect.any(Object),
      globalMessages: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'A message' }],
        },
      ],
    })
  })

  it('serialize 2 steps', async () => {
    const prompt = removeCommonIndent(`
      <step>
        {{foo = 5}}
      </step>
      <step>
        {{foo += 1}}
      </step>
      <step>
        {{foo}}
      </step>
    `)

    const chain = new Chain({ prompt, adapter: Adapters.openai })

    await chain.step()
    await chain.step('First step response')
    const serialized = chain.serialize()
    expect(serialized).toEqual({
      rawText: prompt,
      scope: {
        pointers: { foo: 0 },
        stash: [6],
      },
      adapterType: 'openai',
      compilerOptions: { includeSourceMap: false },
      globalConfig: undefined,
      ast: expect.any(Object),
      globalMessages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'First step response' }],
        },
      ],
    })
  })

  it('serialize parameters', async () => {
    const prompt = removeCommonIndent(`
       Hello {{name}}
    `)

    const chain = new Chain({
      prompt,
      parameters: { name: 'Paco' },
      adapter: Adapters.default,
      defaultRole: MessageRole.user,
    })

    await chain.step()
    const serialized = chain.serialize()
    expect(serialized).toEqual({
      rawText: prompt,
      adapterType: 'default',
      scope: { pointers: { name: 0 }, stash: ['Paco'] },
      compilerOptions: { defaultRole: 'user' },
      ast: expect.any(Object),
      globalConfig: undefined,
      globalMessages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello Paco' }],
        },
      ],
    })
  })
})
