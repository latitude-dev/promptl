import { Adapters, Chain, render } from '$promptl/index'
import { complete } from '$promptl/compiler/test/helpers'
import { removeCommonIndent } from '$promptl/compiler/utils'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import {
  MessageRole,
  SystemMessage,
  UserMessage,
} from '$promptl/types'
import { describe, expect, it, vi } from 'vitest'

describe('scope tags', async () => {
  it('returns contents as usual', async () => {
    const prompt = removeCommonIndent(`
      <user>
        <scope>
          <content-text>This is a text content!</content-text>
        </scope>
      </user>
    `)

    const result = await render({ prompt, adapter: Adapters.default })

    expect(result.messages.length).toBe(1)
    expect(result.messages[0]!.role).toBe(MessageRole.user)
    const message = result.messages[0]! as UserMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'This is a text content!',
      },
    ])
  })

  it('contains its own scope', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 'foo' }}
      {{ bar = 'bar' }}

      <scope baz={{ bar }}>
        {{ baz = 'baz' }}
        {{ foo = 'new foo' }}
      </scope>

      <content-text>{{ foo }}</content-text>
      <content-text>{{ bar }}</content-text>
    `)

    const result = await render({ prompt, adapter: Adapters.default })
    
    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'foo',
      },
      {
        type: 'text',
        text: 'bar',
      },
    ])
  })

  it('does not automatically inherit variables or parameters from parents', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 'bar' }}
      <scope>
        {{ foo }}
      </scope>
    `)

    const action = () => render({
      prompt,
      parameters: { foo: 'baz' },
      adapter: Adapters.default
    })

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('can inherit parameters from parents if explicitly passed', async () => {
    const prompt = removeCommonIndent(`
      <scope foo={{ foo }}>
        {{ foo }}
      </scope>
    `)

    const result = await render({
      prompt,
      parameters: { foo: 'bar' },
      adapter: Adapters.default
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'bar',
      },
    ])
  })

  it('node state from scope is correctly cached during steps', async () => {
    const func = vi.fn()

    const prompt = removeCommonIndent(`
      <scope func={{ func }}>
        <step>
          {{ func() }}
        </step>
        {{ for i in [1, 2] }}
          <step>
            {{ func() }}
          </step>
        {{ endfor }}
      </scope>
    `)

    const chain = new Chain({
      prompt,
      parameters: { func },
    })

    await complete({ chain })

    expect(func).toHaveBeenCalledTimes(3)
  })
})
