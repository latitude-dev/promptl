import { randomUUID } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Adapters, render, scan } from '$promptl/index'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const forbiddenFunctionCall = 'forbidden-function-call'
const forbiddenPropertyAccess = 'forbidden-property-access'
const markerPath = join(
  tmpdir(),
  `.promptl-security-marker-${process.pid}-${randomUUID()}`,
)

function writeMarker() {
  writeFileSync(markerPath, 'marker')
}

function removeMarker() {
  if (existsSync(markerPath)) unlinkSync(markerPath)
}

async function expectRejected(
  prompt: string,
  code: string,
  parameters: Record<string, unknown> = {},
) {
  expect(existsSync(markerPath)).toBe(false)

  const error = await getExpectedError(
    () =>
      render({
        prompt: `${prompt}\n{{ writeMarker() }}`,
        parameters: { ...parameters, writeMarker },
        adapter: Adapters.default,
      }),
    CompileError,
  )

  expect(error).toBeInstanceOf(CompileError)
  expect(error.code).toBe(code)
  expect(existsSync(markerPath)).toBe(false)
}

async function getText(
  prompt: string,
  parameters: Record<string, unknown> = {},
) {
  const { messages } = await render({
    prompt,
    parameters,
    adapter: Adapters.default,
  })
  const content = messages[0]?.content

  return typeof content === 'string'
    ? content
    : content?.map((part) => ('text' in part ? part.text : '')).join('')
}

describe('expression sandboxing', () => {
  beforeEach(removeMarker)
  afterEach(removeMarker)

  it.each([
    '{{ (1).constructor }}',
    "{{ (1).constructor.constructor('return 1')() }}",
    "{{ ''.constructor.constructor('return 1')() }}",
    "{{ (1)['constr' + 'uctor'] }}",
    '{{ ({}).__proto__ }}',
    '{{ ([]).prototype }}',
  ])('rejects forbidden property access in %s', async (prompt) => {
    await expectRejected(prompt, forbiddenPropertyAccess)
  })

  it('blocks a nested computed constructor chain', async () => {
    await expectRejected(
      "{{ (''['constr' + 'uctor']['constr' + 'uctor']('return 1'))() }}",
      forbiddenPropertyAccess,
    )
  })

  it('blocks reaching a child process and runs no code', async () => {
    const touch = `process.getBuiltinModule('child_process').execSync('touch ${markerPath}')`
    await expectRejected(
      `{{ (''.constructor.constructor("return ${touch}"))() }}`,
      forbiddenPropertyAccess,
    )
    await expectRejected(
      `{{ ((1)['constr' + 'uctor']['constr' + 'uctor']("return ${touch}"))() }}`,
      forbiddenPropertyAccess,
    )
  })

  it('blocks __proto__ writes through member and update expressions', async () => {
    await expectRejected(
      "{{ ({}).__proto__.polluted = 'yes' }}",
      forbiddenPropertyAccess,
    )
    await expectRejected(
      "{{ o = { a: 1 } }}{{ o['__proto__']++ }}",
      forbiddenPropertyAccess,
    )
    await expectRejected(
      '{{ o = {} }}{{ o.constructor = 1 }}',
      forbiddenPropertyAccess,
    )
    expect('polluted' in Object.prototype).toBe(false)
  })

  it('rejects __proto__ assignment without changing Object.prototype', async () => {
    const properties = Object.getOwnPropertyDescriptors(Object.prototype)

    await expectRejected("{{ ({})['__proto__'] = 1 }}", forbiddenPropertyAccess)

    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(
      properties,
    )
  })

  it.each(['bind', 'call', 'apply'])('rejects fn.%s()', async (method) => {
    await expectRejected(`{{ fn.${method}() }}`, forbiddenFunctionCall, {
      fn: function () {
        return 'called'
      },
    })
  })

  it('allows a supplied callback to write a marker', async () => {
    try {
      await getText('{{ writeMarker() }}', { writeMarker })
      expect(existsSync(markerPath)).toBe(true)
    } finally {
      removeMarker()
    }
  })

  it('allows calling a supplied function', async () => {
    expect(
      await getText('{{ fn() }}', {
        fn: function () {
          return 'called'
        },
      }),
    ).toBe('called')
  })

  it('allows a string method', async () => {
    expect(await getText("{{ 'abc'.toUpperCase() }}")).toBe('ABC')
  })

  it('sorts and joins [3,1,2]', async () => {
    expect(await getText("{{ [3,1,2].sort().join('-') }}")).toBe('1-2-3')
  })

  it('maps with a JavaScript callback and joins the results', async () => {
    expect(
      await getText("{{ [1,2,3].map(double).join(',') }}", {
        double: function (value: number) {
          return value * 2
        },
      }),
    ).toBe('2,4,6')
  })

  it('reads an assigned plain object property', async () => {
    expect(await getText("{{ foo = { bar: 'baz' } }}{{ foo.bar }}")).toBe('baz')
  })

  it('calls an own-property method with its object as this', async () => {
    const value = {
      text: 'baz',
      label() {
        return this.text
      },
    }

    expect(await getText('{{ value.label() }}', { value })).toBe('baz')
  })

  it('does not let an object literal set the prototype via __proto__', async () => {
    expect(
      await getText(
        "{{ x = { __proto__: { marker: 'leak' } } }}v={{ x.marker }}",
      ),
    ).toBe('v=')
  })

  it('does not let a spread set the prototype via an own __proto__ key', async () => {
    const evil = JSON.parse('{"__proto__": {"marker": "leak"}}')
    expect(
      await getText('{{ y = { ...evil } }}v={{ y.marker }}', { evil }),
    ).toBe('v=')
    expect('marker' in Object.prototype).toBe(false)
  })

  it('does not resolve inherited object members as variables', async () => {
    expect(
      await getText(
        'v={{ constructor }}{{ toString }}{{ valueOf }}{{ __proto__ }}',
      ),
    ).toBe('v=')
  })

  it('keeps a variable named like an inherited member', async () => {
    expect(await getText('{{ constructor = 5 }}v={{ constructor }}')).toBe(
      'v=5',
    )
  })

  it('blocks non-allowlisted built-in methods read as values', async () => {
    await expectRejected(
      "{{ o = {} }}{{ g = o.__defineGetter__ }}{{ g('a', f) }}",
      forbiddenFunctionCall,
      { f: () => 'x' },
    )
    await expectRejected(
      '{{ c = f.call }}{{ c(null) }}',
      forbiddenFunctionCall,
      {
        f: () => 'x',
      },
    )
  })

  it('allows methods of class instances from the scope', async () => {
    class User {
      name: string
      constructor(name: string) {
        this.name = name
      }
      greet(greeting: string) {
        return `${greeting} ${this.name}`
      }
    }
    expect(
      await getText("{{ user.greet('Hi') }}", { user: new User('Ada') }),
    ).toBe('Hi Ada')
  })

  it('allows aliasing an allowlisted method', async () => {
    expect(
      await getText('{{ up = s.toUpperCase }}{{ up() }}', { s: 'ab' }),
    ).toBe('AB')
  })

  it('rejects non-primitive computed keys on the read path', async () => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype)
    const seq = ['toFixed', 'constructor']
    await expectRejected('{{ (1)[k] }}', 'invalid-member-key', {
      k: { toString: seq.shift.bind(seq) },
    })
    await expectRejected('{{ (1)[k] }}', 'invalid-member-key', {
      k: { toString: () => 'constructor' },
    })
    await expectRejected('{{ ""[k] }}', 'invalid-member-key', {
      k: {
        valueOf: () => 'constructor',
        toString: () => 'constructor',
      },
    })
    await expectRejected('{{ (1)[k] }}', 'invalid-member-key', {
      k: ['constructor'],
    })
    await expectRejected(
      "{{ k = { toString: ['toFixed', 'constructor'].shift } }}{{ (1)[k] }}",
      'invalid-member-key',
    )
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before)
    expect((globalThis as any).__pwn).toBeUndefined()
  })

  it('rejects non-primitive computed keys on the write path', async () => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype)
    await expectRejected(
      "{{ k = { toString: ['a', '__proto__'].shift } }}{{ o = {} }}{{ o[k] = { polluted: 1 } }}",
      'invalid-member-key',
    )
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before)
    expect('polluted' in Object.prototype).toBe(false)
  })

  it('rejects the stateful toString constructor chain', async () => {
    delete (globalThis as any).__pwn
    const K = (slot: string, pad: string) =>
      `{ toString: ['${pad}','${pad}','${slot}','${pad}','${pad}','${pad}'].shift }`
    await expectRejected(
      `{{ ka = ${K('constructor', 'toFixed')} }}{{ kb = ${K('constructor', 'toString')} }}` +
        `{{ c = (1)[ka] }}{{ F = c[kb] }}{{ g = F("globalThis.__pwn='x'; return 42") }}{{ g() }}`,
      'invalid-member-key',
    )
    expect((globalThis as any).__pwn).toBeUndefined()
  })

  it('checks callables before binding', async () => {
    await expectRejected(
      '{{ f = box[0] }}{{ f("return 42")() }}',
      forbiddenFunctionCall,
      { box: [Function] },
    )
    await expectRejected('{{ box[0]("return 42")() }}', forbiddenFunctionCall, {
      box: [Function],
    })
  })

  it('still allows string and number computed keys', async () => {
    expect(await getText("{{ o = { a: 1 } }}{{ o['a'] }}")).toBe('1')
    expect(await getText('{{ a = [10, 20] }}{{ a[1] }}')).toBe('20')
    expect(await getText("{{ o = {} }}{{ o[1] = 'x' }}{{ o['1'] }}")).toBe('x')
  })

  it('rejects non-primitive keys in the in operator', async () => {
    await expectRejected('{{ k in { a: 1 } }}', 'invalid-member-key', {
      k: { toString: () => 'a' },
    })
  })

  it('reports forbidden property access during scanning', async () => {
    const metadata = await scan({
      prompt: "{{ (1).constructor.constructor('return 1')() }}",
      withParameters: [],
    })

    expect(
      metadata.errors.some(
        (error) =>
          error instanceof CompileError &&
          error.code === forbiddenPropertyAccess,
      ),
    ).toBe(true)
    expect(existsSync(markerPath)).toBe(false)
  })
})
