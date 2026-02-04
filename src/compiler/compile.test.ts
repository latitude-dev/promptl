import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import type { Message, MessageContent, TextContent } from '$promptl/types'
import { toPromptLFile } from '$promptl/types'
import { describe, expect, it } from 'vitest'

import { Adapters, render } from '$promptl/index'
import { removeCommonIndent } from './utils'

async function getCompiledText(
  prompt: string,
  parameters: Record<string, any> = {},
) {
  const result = await render({
    prompt: removeCommonIndent(prompt),
    parameters,
    adapter: Adapters.default,
  })

  return result.messages.reduce((acc: string, message: Message) => {
    const content =
      typeof message.content === 'string'
        ? message.content
        : (message.content as MessageContent[])
            .map((c) => (c as TextContent).text)
            .join('')

    return acc + content
  }, '')
}

describe('automatic message grouping', async () => {
  it('returns system messages by default', async () => {
    const prompt = 'Hello world!'
    const result = await render({ prompt, adapter: Adapters.default })
    const message = result.messages[0]!
    expect(message.role).toBe('system')
  })

  it('groups consecutive contents with the same role', async () => {
    const prompt = `
      Hello world
      <content-text>
        This is
      </content-text>
      your
      <content-image>
        Captain
      </content-image>
      Jean-Luc
      <content-file mime="text/plain">
        Picard
      </content-file>
      speaking
    `
    const result = await render({ prompt, adapter: Adapters.default })
    const messages = result.messages

    expect(messages.length).toBe(1)
    const message = messages[0]!
    expect(message.role).toBe('system')
    expect(message.content.length).toBe(7)
    expect(message.content[0]!.type).toBe('text')
    expect(message.content[1]!.type).toBe('text')
    expect(message.content[2]!.type).toBe('text')
    expect(message.content[3]!.type).toBe('image')
    expect(message.content[4]!.type).toBe('text')
    expect(message.content[5]!.type).toBe('file')
    expect(message.content[6]!.type).toBe('text')
  })

  it('allows defining the default role', async () => {
    const prompt = 'Hello world!'
    const result = await render({
      prompt,
      defaultRole: 'user',
      adapter: Adapters.default,
    })
    const message = result.messages[0]!
    expect(message.role).toBe('user')
  })
})

describe('config section', async () => {
  it('compiles the YAML written in the config section and returns it as the config attribute in the result', async () => {
    const prompt = `
      ---
      foo: bar
      baz:
       - qux
       - quux
      ---
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
      adapter: Adapters.default,
    })

    expect(result.config).toEqual({
      foo: 'bar',
      baz: ['qux', 'quux'],
    })
  })
})

describe('comments', async () => {
  it('does not add comments to the output', async () => {
    const prompt = `
      anna
      bob
      /* comment */
      charlie
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]!

    expect(message).toEqual({
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'anna\nbob\n\ncharlie',
        },
      ],
    })
  })

  it('also allows using tag comments', async () => {
    const prompt = `
      <system>
        <!-- comment -->
        Test message
      </system>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)

    const message = result.messages[0]!
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'Test message',
      },
    ])
  })
})

describe('variable assignment', async () => {
  it('can define variables', async () => {
    const prompt = `
      {{ foo = 5 }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('5')
  })

  it('undefined variables do not cause an error', async () => {
    const prompt = `
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('')
  })

  it('special $now parameter returns current date in ISO format', async () => {
    const prompt = `
      {{ $now }}
    `
    const result = await getCompiledText(prompt)
    // Check that it's a valid ISO date string (JSON stringified)
    expect(result).toMatch(/^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/)
  })

  it('special $now can be used in expressions', async () => {
    const prompt = `
      {{ time = $now }}
      {{ time }}
    `
    const result = await getCompiledText(prompt)
    // Check that it's a valid ISO date string (JSON stringified)
    expect(result).toMatch(/^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/)
  })

  it('special $now can be used in method calls', async () => {
    const prompt = `
      {{ $now.getTime() }}
    `
    const result = await getCompiledText(prompt)
    const timestamp = parseInt(result.trim())
    expect(timestamp).toBeGreaterThan(0)
    expect(timestamp).toBeLessThan(Date.now() + 1000) // within 1 second
  })

  it('parameters are available as variables in the prompt', async () => {
    const prompt = `
      {{ foo }}
    `

    const result = await getCompiledText(prompt, { foo: 'bar' })
    expect(result).toBe('bar')
  })

  it('can update variables', async () => {
    const prompt = `
      {{ foo = 5 }}
      {{ foo += 2 }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('7')
  })

  it('cannot update variables that are not defined', async () => {
    const prompt = `
      {{ foo += 2 }}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
        adapter: Adapters.default,
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('variables defined in an inner scope are not available in the outer scope', async () => {
    const prompt = `
      {{ if true }}
        {{ foo = 5 }}
      {{ endif }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('')
  })

  it('variables can be modified from an inner scope', async () => {
    const prompt = `
      {{ foo = 5 }}
      {{ if true }}
        {{ foo += 2 }}
      {{ endif }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('7')
  })

  it('can update nested values', async () => {
    const prompt = `
      {{ foo = { a: 1, b: 2 }  }}
      {{ foo.a += 2 }}
      {{ foo.b += 3 }}
      {{ foo.a }} {{ foo.b }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('3 5')
  })

  it('fails when nested value does not exist', async () => {
    const prompt = `
      {{ foo = { a: 1, b: 2 }  }}
      {{ foo.c += 2 }}
      {{ foo.c }}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
        adapter: Adapters.default,
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('property-not-exists')
  })

  it('does not allow assignation on optional chaining operator', async () => {
    const prompt = `
      {{ foo = { a: 1, b: 2 }  }}
      {{ foo?.a = 2 }}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
        adapter: Adapters.default,
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('parse-error') // Requirement is already implemented in the parser
  })

  it('allow reassigning elements in an array', async () => {
    const prompt = `
      {{ foo = [1, 2, 3, 4, 5, 6]  }}
      {{ foo[3] = 'bar' }}

      {{ foo }}
    `

    const result = await getCompiledText(prompt)
    expect(result).toBe('[1,2,3,"bar",5,6]')
  })

  it('can modify variables with update operators', async () => {
    const prompt1 = `{{ foo = 0 }} {{ foo++ }} {{ foo }}`
    const prompt2 = `{{ foo = 0 }} {{ ++foo }} {{ foo }}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('0 1')
    expect(result2).toBe('1 1')
  })

  it('fails when trying to use update expressions on non-number values', async () => {
    const prompt = `
      {{ foo = "bar" }}
      {{ ++foo }}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
        adapter: Adapters.default,
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('invalid-update')
  })
})

describe('operators', async () => {
  it('correctly evaluates binary expressions', async () => {
    const expressions: [string, any][] = [
      ['2 == 2', true],
      ['2 == 3', false],
      ["2 == 'cat'", false],
      ["2 == '2'", true],
      ['2 != 2', false],
      ['2 != 3', true],
      ['2 === 2', true],
      ["2 === '2'", false],
      ['2 !== 2', false],
      ["2 !== '2'", true],
      ['2 < 2', false],
      ['2 < 3', true],
      ['2 < 1', false],
      ['2 <= 2', true],
      ['2 <= 3', true],
      ['2 <= 1', false],
      ['2 > 2', false],
      ['2 > 3', false],
      ['2 > 1', true],
      ['2 >= 2', true],
      ['2 >= 3', false],
      ['2 >= 1', true],
      ['2 << 2', 8],
      ['2 >> 2', 0],
      ['2 >>> 2', 0],
      ['2 + 3', 5],
      ['2 - 3', -1],
      ['2 * 3', 6],
      ['2 / 3', 2 / 3],
      ['2 % 3', 2],
      ['2 | 3', 3],
      ['2 ^ 3', 1],
      ['2 & 3', 2],
      ["'cat' in {cat: 1, dog: 2}", true],
      ["'cat' in {dog: 1, hamster: 2}", false],
    ]
    for (const [expression, expected] of expressions) {
      const cleanExpression = expression.replace(/</g, '\\<')
      const prompt = `${cleanExpression} = {{ ${expression} }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })

  it('correctly evaluates logical expressions', async () => {
    const expressions = [
      ['true && true', true],
      ['true && false', false],
      ['false && true', false],
      ['false && false', false],
      ['true || true', true],
      ['true || false', true],
      ['false || true', true],
      ['false || false', false],
      ['false ?? true', false],
      ['null ?? true', true],
    ]
    for (const [expression, expected] of expressions) {
      const prompt = `${expression} = {{ ${expression} }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })

  it('correctly evaluates unary expressions', async () => {
    const expressions = [
      ['-2', -2],
      ['+2', 2],
      ['!true', false],
      ['~2', ~2],
      ['typeof 2', 'number'],
      ['void 2', undefined],
    ]
    for (const [expression, expected] of expressions) {
      const prompt = `${expression} = {{ ${expression} }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected ?? ''}`.trim())
    }
  })

  it('correctly evaluates member expressions', async () => {
    const prompt = `{{ foo = { bar: 'var' }  }}{{ foo.bar }}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('var')
  })

  it('correctly evaluates assignment expressions', async () => {
    const expressions: [string, any, any][] = [
      ['foo += 2', 3, 5],
      ['foo -= 2', 3, 1],
      ['foo *= 2', 3, 6],
      ['foo /= 2', 3, 1.5],
      ['foo %= 2', 3, 1],
      ['foo <<= 2', 3, 12],
      ['foo >>= 2', 3, 0],
      ['foo >>>= 2', 3, 0],
      ['foo |= 2', 3, 3],
      ['foo ^= 2', 3, 1],
      ['foo &= 2', 3, 2],
    ]
    for (const [expression, initial, expected] of expressions) {
      const cleanExpression = expression.replace(/</g, '\\<')
      const prompt = `{{ foo = ${initial} }} {{ ${expression} }} ${cleanExpression} -> {{ foo }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} -> ${expected}`)
    }
  })

  it('can evaluate complex expressions respecting operator precedence', async () => {
    const expressions: [string, any][] = [
      ['2 + 3 * 4', 14],
      ['2 * 3 + 4', 10],
      ['2 * (3 + 4)', 14],
      ['2 + 3 * 4 / 2', 8],
      ['2 + 3 * 4 % 2', 2],
      ['2 + 3 * 4 | 2', 14],
      ['2 + 3 * 4 ^ 2', 12],
      ['2 + 3 * 4 & 2', 2],
      ['2 + 3 * 4 === 14', true],
      ['2 + 3 * 4 !== 14', false],
      ['2 + 3 * 4 == 14', true],
      ['2 + 3 * 4 != 14', false],
      ["'a' + 'b' in {ab: 1, bc: 2}", true],
      ["'a' + 'b' in {bc: 1, cd: 2}", false],
      ["'a' + 'b' in {ab: 1, bc: 2} && 'a' + 'b' in {bc: 1, cd: 2}", false],
      ["'a' + 'b' in {ab: 1, bc: 2} || 'a' + 'b' in {bc: 1, cd: 2}", true],
    ]
    for (const [expression, expected] of expressions) {
      const prompt = `${expression} = {{ ${expression} }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })
})

describe('source map', async () => {
  it('does not include source map when not specified', async () => {
    const prompt = `
Given a context, answer questions succintly yet complete.
<system>{{ context }}</system>
<user>Please, help me with {{ question }}!</user>
    `
    const { messages } = await render({
      prompt,
      parameters: {
        context: 'context',
        question: 'question',
      },
      adapter: Adapters.default,
    })
    expect(messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Given a context, answer questions succintly yet complete.',
          },
        ],
      },
      {
        role: 'system',
        content: [{ type: 'text', text: 'context' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Please, help me with question!' }],
      },
    ])
  })

  it('does not include source map when non-default adapter', async () => {
    const prompt = `
Given a context, answer questions succintly yet complete.
<system>{{ context }}</system>
<user>Please, help me with {{ question }}!</user>
    `
    const { messages } = await render({
      prompt,
      parameters: {
        context: 'context',
        question: 'question',
      },
      adapter: Adapters.openai,
      includeSourceMap: true,
    })
    expect(messages).toEqual([
      {
        role: 'system',
        content: 'Given a context, answer questions succintly yet complete.',
      },
      {
        role: 'system',
        content: 'context',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Please, help me with question!' }],
      },
    ])
  })

  describe('includes source map when specified', async () => {
    it('returns empty source map when no identifiers', async () => {
      const prompt = `
Given a context, answer questions succintly yet complete.
<system>context</system>
<user>Please, help me with question!</user>
      `
      const { messages } = await render({
        prompt,
        adapter: Adapters.default,
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Given a context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'context',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please, help me with question!',
              _promptlSourceMap: [],
            },
          ],
        },
      ])
    })

    it('returns source map when single identifiers per content', async () => {
      const prompt = `
Given a context, answer questions succintly yet complete.
<system>{{ context }}</system>
<user>Please, help me with {{ question }}!</user>
      `
      const { messages } = await render({
        prompt,
        parameters: {
          context: 'context',
          question: 'question',
        },
        adapter: Adapters.default,
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Given a context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'context',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 7,
                  identifier: 'context',
                },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please, help me with question!',
              _promptlSourceMap: [
                {
                  start: 21,
                  end: 29,
                  identifier: 'question',
                },
              ],
            },
          ],
        },
      ])
    })

    it('returns source map when multiple identifiers per content', async () => {
      const prompt = `
Given some context, answer questions succintly yet complete.
<system>{{ context_1 }} and {{ context_2 }}</system>
<user>Please, help me with {{ question_1 }} and {{ question_2 }}!</user>
      `
      const { messages } = await render({
        prompt,
        parameters: {
          context_1: 'context_1',
          context_2: 'context_2',
          question_1: 'question_1',
          question_2: 'question_2',
        },
        adapter: Adapters.default,
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Given some context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'context_1 and context_2',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 9,
                  identifier: 'context_1',
                },
                {
                  start: 14,
                  end: 23,
                  identifier: 'context_2',
                },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please, help me with question_1 and question_2!',
              _promptlSourceMap: [
                {
                  start: 21,
                  end: 31,
                  identifier: 'question_1',
                },
                {
                  start: 36,
                  end: 46,
                  identifier: 'question_2',
                },
              ],
            },
          ],
        },
      ])
    })

    it('returns source map when duplicated identifiers', async () => {
      const prompt = `
Given a context, answer questions succintly yet complete.
<system>{{ context }} and {{ context }}</system>
<user>Please, help me with {{ question }} and {{ question }}!</user>
      `
      const { messages } = await render({
        prompt,
        parameters: {
          context: 'context',
          question: 'question',
        },
        adapter: Adapters.default,
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Given a context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'context and context',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 7,
                  identifier: 'context',
                },
                {
                  start: 12,
                  end: 19,
                  identifier: 'context',
                },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please, help me with question and question!',
              _promptlSourceMap: [
                {
                  start: 21,
                  end: 29,
                  identifier: 'question',
                },
                {
                  start: 34,
                  end: 42,
                  identifier: 'question',
                },
              ],
            },
          ],
        },
      ])
    })

    it('returns source map when multiple new lines and indents', async () => {
      const prompt = `
  Given a context, answer questions succintly yet complete.
  <system>


    {{ context }}


  </system>
      <user>

  Please, help me
    with {{ question }}!
  </user>
<user>
  Is this the real life?
  
  <content-text>
    Is this just fantasy?
      {{ lyrics }}
      
      
  </content-text>
<content-image>{{image}}</content-image>
<content-file mime="text/plain">
  {{file}}
</content-file>
</user>

    {{empty}}{{empty}}
      `
      const { messages } = await render({
        prompt,
        parameters: {
          context: 'context',
          question: 'question',
          lyrics: 'lyrics',
          image: 'image',
          file: 'file',
          empty: '   ',
        },
        adapter: Adapters.default,
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Given a context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'context',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 7,
                  identifier: 'context',
                },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please, help me\n  with question!',
              _promptlSourceMap: [
                {
                  start: 23,
                  end: 31,
                  identifier: 'question',
                },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Is this the real life?',
              _promptlSourceMap: [],
            },
            {
              type: 'text',
              text: 'Is this just fantasy?\n  lyrics',
              _promptlSourceMap: [
                {
                  start: 24,
                  end: 30,
                  identifier: 'lyrics',
                },
              ],
            },
            {
              type: 'image',
              image: 'image',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 5,
                  identifier: 'image',
                },
              ],
            },
            {
              type: 'file',
              file: 'file',
              mimeType: 'text/plain',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 4,
                  identifier: 'file',
                },
              ],
            },
          ],
        },
      ])
    })
  })
})

describe('promptL files', async () => {
  it('automatically adds interpolated promptL files as content tags', async () => {
    const prompt = `
      Take a look at this file: {{ file }}. What does it contain?
    `

    const file = { name: 'file.txt', size: 12, type: 'text/plain' }
    const url = 'https://example.com/file.txt'

    const promptLFile = toPromptLFile({ file, url })

    const { messages } = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { file: promptLFile },
      adapter: Adapters.default,
    })

    expect(messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Take a look at this file:',
          },
          {
            type: 'file',
            file: 'https://example.com/file.txt',
            mimeType: 'text/plain',
          },
          {
            type: 'text',
            text: '. What does it contain?',
          },
        ],
      },
    ])
  })

  it('automatically adds promptL files as images when the file is an image', async () => {
    const prompt = `
      Look how pretty I am: {{ selfie }}
    `

    const file = { name: 'selfie.png', size: 12, type: 'image/png' }

    const url = 'https://example.com/selfie.png'
    const promptLFile = toPromptLFile({ file, url })

    const { messages } = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { selfie: promptLFile },
      adapter: Adapters.default,
    })

    expect(messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Look how pretty I am:',
          },
          {
            type: 'image',
            image: 'https://example.com/selfie.png',
          },
        ],
      },
    ])
  })

  it('a promptlfile inside a content tag only adds the url', async () => {
    const prompt = `
      This is a file:
      <content-file mime="text/plain">
        {{ file }}
      </content-file>
    `

    const file = { name: 'file.txt', size: 12, type: 'text/plain' }
    const url = 'https://example.com/file.txt'

    const promptLFile = toPromptLFile({ file, url })

    const { messages } = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { file: promptLFile },
      adapter: Adapters.default,
    })

    expect(messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'This is a file:',
          },
          {
            type: 'file',
            file: 'https://example.com/file.txt',
            mimeType: 'text/plain',
          },
        ],
      },
    ])
  })

  it('adds arrays of promptL files as multiple content tags', async () => {
    const prompt = `
      Look at these files:
      {{ files }}
    `
    const files: { type: string; size: number; name: string }[] = [
      { name: 'file.txt', size: 12, type: 'text/plain' },
      { name: 'selfie.png', size: 12, type: 'image/png' },
      { name: 'document.pdf', size: 34, type: 'application/pdf' },
    ]

    const urls = [
      'https://example.com/file.txt',
      'https://example.com/selfie.png',
      'https://example.com/document.pdf',
    ]

    const promptLFiles = files.map((file, i) =>
      toPromptLFile({ file, url: urls[i]! }),
    )

    const { messages } = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { files: promptLFiles },
      adapter: Adapters.default,
    })

    expect(messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Look at these files:',
          },
          {
            type: 'file',
            file: 'https://example.com/file.txt',
            mimeType: 'text/plain',
          },
          {
            type: 'image',
            image: 'https://example.com/selfie.png',
          },
          {
            type: 'file',
            file: 'https://example.com/document.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ])
  })
})
