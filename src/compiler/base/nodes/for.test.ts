import { Message, MessageContent, TextContent } from '$promptl/types'
import { describe, expect, it } from 'vitest'

import { Adapters, render } from '$promptl/index'
import { removeCommonIndent } from '../../utils'

async function getCompiledText(
  prompt: string,
  parameters: Record<string, any> = {},
) {
  const result = await render({
    prompt: removeCommonIndent(prompt),
    parameters,
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

function getMessageTexts(messages: Message[]): string[] {
  return messages.map((m) =>
    (m.content as MessageContent[])
      .map((c) => (c as TextContent).text)
      .join(''),
  )
}

describe('each loops', async () => {
  it('iterates over any iterable object', async () => {
    const prompt1 = `{{ for element in  [1, 2, 3] }} {{element}} {{ endfor }}`
    const prompt2 = `{{ for element in "foo" }} {{element}} {{ endfor }}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('123')
    expect(result2).toBe('foo')
  })

  it('computes the else block when the element is not iterable', async () => {
    const prompt1 = `{{ for element in 5}} {{element}} {{ else }} FOO {{ endfor }}`
    const prompt2 = `{{ for element in { a: 1, b: 2, c: 3 } }} {{element}} {{ else }} FOO {{ endfor }}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('FOO')
    expect(result2).toBe('FOO')
  })

  it('computes the else block when the iterable object is empty', async () => {
    const prompt = `{{ for element in [] }} {{element}} {{ else }} FOO {{ endfor }}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('FOO')
  })

  it('does not do anything when the iterable object is not iterable and there is no else block', async () => {
    const prompt = `{{ for element in 5 }} {{element}} {{ endfor }}`
    expect(render({ prompt, parameters: {} })).resolves
  })

  it('gives access to the index of the element', async () => {
    const prompt = `{{ for element, index in ['a', 'b', 'c'] }} {{index}} {{ endfor }}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('012')
  })

  it('respects variable scope', async () => {
    const prompt1 = `{{ for elemenet in ['a', 'b', 'c'] }} {{foo = 5}} {{ endfor }} {{foo}}`
    const prompt2 = `{{foo = 5}} {{ for element in ['a', 'b', 'c'] }} {{foo = 7}} {{ endfor }} {{foo}}`
    const prompt3 = `{{foo = 5}} {{ for element in [1, 2, 3] }} {{foo += element}} {{ endfor }} {{foo}}`
    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)
    const result3 = await getCompiledText(prompt3)

    expect(result1).toBe('')
    expect(result2).toBe('7')
    expect(result3).toBe('11')
  })
})

describe('nested loops', async () => {
  it('renders all inner elements for each outer iteration', async () => {
    const prompt = removeCommonIndent(`
      {{ for category in categories }}
      <user>
      Category: {{category.name}}
      {{ for fruit in category.fruits }}
      - {{ fruit }}
      {{ endfor }}
      </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        categories: [
          { name: 'andres', fruits: ['banana'] },
          { name: 'manu', fruits: ['apple', 'tomato'] },
          { name: 'paula', fruits: ['watermelon', 'banana'] },
        ],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(3)
    expect(texts[0]).toContain('andres')
    expect(texts[0]).toContain('banana')
    expect(texts[1]).toContain('manu')
    expect(texts[1]).toContain('apple')
    expect(texts[1]).toContain('tomato')
    expect(texts[2]).toContain('paula')
    expect(texts[2]).toContain('watermelon')
    expect(texts[2]).toContain('banana')
  })

  it('does not skip inner elements when outer arrays have different lengths', async () => {
    const prompt = removeCommonIndent(`
      {{ for group in groups }}
      <user>
      {{ for item in group }}
      {{item}}
      {{ endfor }}
      </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [['a'], ['b', 'c'], ['d', 'e', 'f']],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(3)
    expect(texts[0]).toContain('a')
    expect(texts[1]).toContain('b')
    expect(texts[1]).toContain('c')
    expect(texts[2]).toContain('d')
    expect(texts[2]).toContain('e')
    expect(texts[2]).toContain('f')
  })

  it('handles inner loop with single-element arrays followed by multi-element arrays', async () => {
    const prompt = removeCommonIndent(`
      {{ for group in groups }}
      <user>
      {{ for item in group }}
      {{item}}
      {{ endfor }}
      </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [['x'], ['y', 'z']],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(2)
    expect(texts[0]).toContain('x')
    expect(texts[1]).toContain('y')
    expect(texts[1]).toContain('z')
  })

  it('handles empty inner arrays correctly', async () => {
    const prompt = removeCommonIndent(`
      {{ for group in groups }}
      <user>
      Group:
      {{ for item in group }}
      {{item}}
      {{ endfor }}
      </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [[], ['a', 'b'], []],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(3)
    expect(texts[1]).toContain('a')
    expect(texts[1]).toContain('b')
  })

  it('renders three levels of nested loops correctly', async () => {
    const prompt = removeCommonIndent(`
      {{ for a in [1, 2] }}
        {{ for b in [1, 2] }}
          {{ for c in [1, 2] }}
            <user>{{a}}.{{b}}.{{c}}</user>
          {{ endfor }}
        {{ endfor }}
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)
    expect(result.messages.length).toBe(8)
    expect(texts).toEqual([
      '1.1.1',
      '1.1.2',
      '1.2.1',
      '1.2.2',
      '2.1.1',
      '2.1.2',
      '2.2.1',
      '2.2.2',
    ])
  })

  it('handles nested loops with conditionals inside', async () => {
    const prompt = removeCommonIndent(`
      {{ for group in groups }}
      <user>
      {{ for item in group }}
      {{ if item > 2 }}big:{{item}}{{ else }}small:{{item}}{{ endif }}
      {{ endfor }}
      </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [
          [1, 3],
          [4, 2, 5],
        ],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(2)
    expect(texts[0]).toContain('small:1')
    expect(texts[0]).toContain('big:3')
    expect(texts[1]).toContain('big:4')
    expect(texts[1]).toContain('small:2')
    expect(texts[1]).toContain('big:5')
  })

  it('handles nested loops with index variables', async () => {
    const prompt = removeCommonIndent(`
      {{ for group, gi in groups }}
      <user>
      {{ for item, ii in group }}
      {{gi}}.{{ii}}:{{item}}
      {{ endfor }}
      </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [['a'], ['b', 'c', 'd']],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(2)
    expect(texts[0]).toContain('0.0:a')
    expect(texts[1]).toContain('1.0:b')
    expect(texts[1]).toContain('1.1:c')
    expect(texts[1]).toContain('1.2:d')
  })

  it('correctly aggregates values across nested loop iterations', async () => {
    const prompt = removeCommonIndent(`
      {{ for outer in [[1, 2], [3, 4], [5, 6]] }}
        {{ for inner in outer }}
          <user>{{inner}}</user>
        {{ endfor }}
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)
    expect(texts).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('does not produce duplicate or missing messages with varying inner array sizes', async () => {
    const prompt = removeCommonIndent(`
      {{ for row in rows }}
        {{ for cell in row.cells }}
          <user>{{row.id}}-{{cell}}</user>
        {{ endfor }}
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        rows: [
          { id: 'A', cells: ['1'] },
          { id: 'B', cells: ['2', '3'] },
          { id: 'C', cells: ['4'] },
          { id: 'D', cells: ['5', '6', '7'] },
        ],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)
    expect(texts).toEqual([
      'A-1',
      'B-2',
      'B-3',
      'C-4',
      'D-5',
      'D-6',
      'D-7',
    ])
  })

  it('handles nested loops where first outer iteration has more inner elements than subsequent ones', async () => {
    const prompt = removeCommonIndent(`
      {{ for group in groups }}
        {{ for item in group }}
          <user>{{item}}</user>
        {{ endfor }}
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [
          ['a', 'b', 'c'],
          ['d'],
          ['e', 'f'],
        ],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)
    expect(texts).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('handles nested loops with else blocks in the inner loop', async () => {
    const prompt = removeCommonIndent(`
      {{ for group in groups }}
        <user>
        {{ for item in group }}
          item:{{item}}
        {{ else }}
          empty
        {{ endfor }}
        </user>
      {{ endfor }}
    `)

    const result = await render({
      prompt,
      parameters: {
        groups: [['a'], [], ['b', 'c']],
      },
      adapter: Adapters.default,
    })

    const texts = getMessageTexts(result.messages)

    expect(result.messages.length).toBe(3)
    expect(texts[0]).toContain('item:a')
    expect(texts[1]).toContain('empty')
    expect(texts[2]).toContain('item:b')
    expect(texts[2]).toContain('item:c')
  })
})
