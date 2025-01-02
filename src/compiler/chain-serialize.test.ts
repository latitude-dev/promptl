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
      ast: {
        type: 'Fragment',
        start: 0,
        end: 27,
        status: { completedAs: true, scopePointers: undefined },
        children: [
          {
            type: 'MustacheTag',
            start: 0,
            end: 17,
            status: { completedAs: true, scopePointers: undefined },
            expression: {
              type: 'AssignmentExpression',
              start: 3,
              end: 14,
              left: {
                type: 'Identifier',
                name: 'foo',
                start: 3,
                end: 6,
                loc: {
                  start: { column: 3, line: 1 },
                  end: { column: 6, line: 1 },
                },
              },
              loc: {
                start: { column: 3, line: 1 },
                end: { column: 14, line: 1 },
              },
              operator: '=',
              right: {
                type: 'Literal',
                start: 9,
                end: 14,
                raw: "'foo'",
                value: 'foo',
                loc: {
                  start: { column: 9, line: 1 },
                  end: { column: 14, line: 1 },
                },
              },
            },
          },
          {
            type: 'Text',
            start: 17,
            end: 27,
            data: '\nA message',
            raw: '\nA message',
            status: {
              completedAs: true,
              scopePointers: undefined,
            },
          },
        ],
      },
      scope: {
        pointers: { foo: 0 },
        stash: ['foo'],
      },
      adapterType: 'default',
      compilerOptions: {},
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
      ast: {
        type: 'Fragment',
        start: 0,
        end: 83,
        status: { scopePointers: { foo: 0 } },
        children: [
          {
            type: 'ElementTag',
            name: 'step',
            start: 0,
            end: 28,
            status: { completedAs: true, scopePointers: undefined },
            attributes: [],
            children: [
              {
                start: 6,
                end: 9,
                type: 'Text',
                raw: '\n  ',
                data: '\n  ',
                status: { scopePointers: undefined, completedAs: true },
              },
              {
                type: 'MustacheTag',
                start: 9,
                end: 20,
                status: { completedAs: true, scopePointers: undefined },
                expression: {
                  type: 'AssignmentExpression',
                  start: 11,
                  end: 18,
                  left: {
                    type: 'Identifier',
                    name: 'foo',
                    start: 11,
                    end: 14,
                    loc: expect.any(Object),
                  },
                  loc: expect.any(Object),
                  operator: '=',
                  right: {
                    type: 'Literal',
                    start: 17,
                    end: 18,
                    raw: '5',
                    value: 5,
                    loc: expect.any(Object),
                  },
                },
              },
              {
                start: 20,
                end: 21,
                type: 'Text',
                raw: '\n',
                data: '\n',
                status: { scopePointers: undefined, completedAs: true },
              },
            ],
          },
          {
            start: 28,
            end: 29,
            type: 'Text',
            raw: '\n',
            data: '\n',
            status: { scopePointers: undefined, completedAs: true },
          },
          {
            type: 'ElementTag',
            name: 'step',
            start: 29,
            end: 58,
            status: { scopePointers: { foo: 0 } },
            attributes: [],
            children: [
              {
                start: 35,
                end: 38,
                type: 'Text',
                raw: '\n  ',
                data: '\n  ',
                status: { scopePointers: undefined, completedAs: true },
              },
              {
                type: 'MustacheTag',
                start: 38,
                end: 50,
                status: { completedAs: true, scopePointers: undefined },
                expression: {
                  type: 'AssignmentExpression',
                  start: 40,
                  end: 48,
                  left: {
                    type: 'Identifier',
                    name: 'foo',
                    start: 40,
                    end: 43,
                    loc: expect.any(Object),
                  },
                  loc: expect.any(Object),
                  operator: '+=',
                  right: {
                    type: 'Literal',
                    start: 47,
                    end: 48,
                    raw: '1',
                    value: 1,
                    loc: expect.any(Object),
                  },
                },
              },
              {
                start: 50,
                end: 51,
                type: 'Text',
                raw: '\n',
                data: '\n',
                status: { scopePointers: undefined, completedAs: true },
              },
            ],
          },
          {
            start: 58,
            end: 59,
            type: 'Text',
            raw: '\n',
            data: '\n',
          },
          {
            start: 59,
            end: 83,
            type: 'ElementTag',
            name: 'step',
            attributes: [],
            children: [
              { start: 65, end: 68, type: 'Text', raw: '\n  ', data: '\n  ' },
              {
                start: 68,
                end: 75,
                type: 'MustacheTag',
                expression: {
                  type: 'Identifier',
                  name: 'foo',
                  start: 70,
                  end: 73,
                  loc: {
                    start: { column: 4, line: 8 },
                    end: { column: 7, line: 8 },
                  },
                },
              },
              { start: 75, end: 76, type: 'Text', raw: '\n', data: '\n' },
            ],
          },
        ],
      },
      scope: {
        pointers: { foo: 0 },
        stash: [6],
      },
      adapterType: 'openai',
      compilerOptions: { includeSourceMap: false },
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
      adapterType: 'default',
      scope: { pointers: { name: 0 }, stash: ['Paco'] },
      compilerOptions: { defaultRole: 'user' },
      ast: {
        type: 'Fragment',
        start: 0,
        end: 14,
        status: { completedAs: true, scopePointers: undefined },
        children: [
          {
            data: 'Hello ',
            end: 6,
            raw: 'Hello ',
            start: 0,
            status: {
              completedAs: true,
              scopePointers: undefined,
            },
            type: 'Text',
          },
          {
            end: 14,
            expression: {
              type: 'Identifier',
              name: 'name',
              start: 8,
              end: 12,
              loc: expect.any(Object),
            },
            start: 6,
            status: {
              completedAs: true,
              scopePointers: undefined,
            },
            type: 'MustacheTag',
          },
        ],
      },
    })
  })
})
