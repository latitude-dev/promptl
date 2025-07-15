import CompileError from '$promptl/error/error'
import { complete } from '$promptl/compiler/test/helpers'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { Chain } from '$promptl/index'
import { describe, expect, it, vi } from 'vitest'

describe('step tags', async () => {
  it('does not create a variable from response if not specified', async () => {
    const mock = vi.fn()
    const prompt = removeCommonIndent(`
      <step>
        Ensure truthfulness of the following statement, give a reason and a confidence score.
        Statement: fake statement
      </step>
      <step>
        Now correct the statement if it is not true.
      </step>
    `)

    const chain = new Chain({ prompt, parameters: { mock } })
    await complete({
      chain,
      callback: async () =>
        `
      The statement is not true because it is fake. My confidence score is 100.
    `.trim(),
    })

    expect(mock).not.toHaveBeenCalled()
  })

  it('creates a text variable from response if specified', async () => {
    const mock = vi.fn()
    const prompt = removeCommonIndent(`
      <step as="analysis">
        Ensure truthfulness of the following statement, give a reason and a confidence score.
        Statement: fake statement
      </step>
      <step>
        {{ mock(analysis) }}
        Now correct the statement if it is not true.
      </step>
    `)

    const chain = new Chain({ prompt, parameters: { mock } })
    await complete({
      chain,
      callback: async () =>
        `
      The statement is not true because it is fake. My confidence score is 100.
    `.trim(),
    })

    expect(mock).toHaveBeenCalledWith(
      'The statement is not true because it is fake. My confidence score is 100.',
    )
  })

  it('creates an object variable from response if specified and schema is provided', async () => {
    const mock = vi.fn()
    const prompt = removeCommonIndent(`
      <step as="analysis" schema={{{type: "object", properties: {truthful: {type: "boolean"}, reason: {type: "string"}, confidence: {type: "integer"}}, required: ["truthful", "reason", "confidence"]}}}>
        Ensure truthfulness of the following statement, give a reason and a confidence score.
        Statement: fake statement
      </step>
      <step>
        {{ mock(analysis) }}
        {{ if !analysis.truthful && analysis.confidence > 50 }}
          Correct the statement taking into account the reason: '{{ analysis.reason }}'.
        {{ endif }}
      </step>
    `)

    const chain = new Chain({ prompt, parameters: { mock } })
    const { messages } = await complete({
      chain,
      callback: async () =>
        `
      {
        "truthful": false,
        "reason": "It is fake",
        "confidence": 100
      }
    `.trim(),
    })

    expect(mock).toHaveBeenCalledWith({
      truthful: false,
      reason: 'It is fake',
      confidence: 100,
    })
    expect(messages[2]!.content).toEqual(
      "Correct the statement taking into account the reason: 'It is fake'.",
    )
  })

  it('fails creating an object variable from response if specified and schema is provided but response is invalid', async () => {
    const mock = vi.fn()
    const prompt = removeCommonIndent(`
      <step as="analysis" schema={{{type: "object", properties: {truthful: {type: "boolean"}, reason: {type: "string"}, confidence: {type: "integer"}}, required: ["truthful", "reason", "confidence"]}}}>
        Ensure truthfulness of the following statement, give a reason and a confidence score.
        Statement: fake statement
      </step>
      <step>
        {{ mock(analysis) }}
        {{ if !analysis.truthful && analysis.confidence > 50 }}
          Correct the statement taking into account the reason: '{{ analysis.reason }}'.
        {{ endif }}
      </step>
    `)

    const chain = new Chain({ prompt, parameters: { mock } })
    let error: CompileError
    try {
      await complete({
        chain,
        callback: async () =>
          `
      Bad JSON.
    `.trim(),
      })
    } catch (e) {
      error = e as CompileError
      expect(e).toBeInstanceOf(CompileError)
    }

    expect(error!.code).toBe('invalid-step-response-format')
    expect(mock).not.toHaveBeenCalled()
  })

  it('creates a raw variable from response if specified', async () => {
    const mock = vi.fn()
    const prompt = removeCommonIndent(`
      <step raw="analysis">
        Ensure truthfulness of the following statement, give a reason and a confidence score.
        Statement: fake statement
      </step>
      <step>
        {{ mock(analysis) }}
        Now correct the statement if it is not true.
      </step>
    `)

    const chain = new Chain({ prompt, parameters: { mock } })
    await complete({
      chain,
      callback: async () =>
        `
      The statement is not true because it is fake. My confidence score is 100.
    `.trim(),
    })

    expect(mock).toHaveBeenCalledWith({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'The statement is not true because it is fake. My confidence score is 100.',
        },
      ],
    })
  })
})
