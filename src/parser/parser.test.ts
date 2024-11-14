import { CUSTOM_TAG_END, CUSTOM_TAG_START, TAG_NAMES } from '$promptl/constants'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import { describe, expect, it } from 'vitest'

import parse from '.'
import { TemplateNode } from './interfaces'

describe('Fragment', async () => {
  it('parses any string as a fragment', async () => {
    const fragment = parse('hello world')
    expect(fragment.type).toBe('Fragment')
  })
})

describe('Text Block', async () => {
  it('parses any regular string as a text block', async () => {
    const text = 'hello world'
    const fragment = parse(text)
    expect(fragment.children.length).toBe(1)

    const textBlock = fragment.children[0]!
    expect(textBlock.type).toBe('Text')
    expect(textBlock.data).toBe(text)
  })

  it('keeps line breaks', async () => {
    const text = 'hello\nworld'
    const fragment = parse(text)
    expect(fragment.children.length).toBe(1)

    const textBlock = fragment.children[0]!
    expect(textBlock.type).toBe('Text')
    expect(textBlock.data).toBe(text)
  })

  it('parses escaped brackets as text', async () => {
    const text = `hello \\${CUSTOM_TAG_START} world`
    const expected = `hello ${CUSTOM_TAG_START} world`
    const fragment = parse(text)
    expect(fragment.children.length).toBe(1)

    const textBlock = fragment.children[0]!
    expect(textBlock.type).toBe('Text')
    expect(textBlock.data).toBe(expected)
  })
})

describe('Comments', async () => {
  it('parses a multiline comment block', async () => {
    const fragment = parse('/* hello\nworld */')
    expect(fragment.children.length).toBe(1)

    const commentBlock = fragment.children[0]!
    expect(commentBlock.type).toBe('Comment')
    expect(commentBlock.data).toBe(' hello\nworld ')
    expect(commentBlock.raw).toBe('/* hello\nworld */')
  })

  it('ignores brackets and any other block within a comment', async () => {
    const fragment = parse(
      `
/* hello
  ${CUSTOM_TAG_START}#if condition${CUSTOM_TAG_END}then${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
world */
    `.trim(),
    )
    expect(fragment.children.length).toBe(1)

    const commentBlock = fragment.children[0]!
    expect(commentBlock.type).toBe('Comment')
    expect(commentBlock.data).toBe(
      ` hello\n  ${CUSTOM_TAG_START}#if condition${CUSTOM_TAG_END}then${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}\nworld `,
    )
  })

  it('Allows tag comments', async () => {
    const fragment = parse('<!-- hello -->')
    expect(fragment.children.length).toBe(1)

    const commentBlock = fragment.children[0]!
    expect(commentBlock.type).toBe('Comment')
    expect(commentBlock.data).toBe(' hello ')
  })
})

describe('Tags', async () => {
  it('parses HTML-like tags with known tag names', async () => {
    const fragment = parse(`<${TAG_NAMES.message}></${TAG_NAMES.message}>`)
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe(TAG_NAMES.message)
  })

  it('parses self closing tags', async () => {
    const fragment = parse(`<${TAG_NAMES.content} />`)
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe(TAG_NAMES.content)
  })

  it('parses tags with unknown tag names as plain text', async () => {
    const fragment = parse('<custom-tag></custom-tag>')
    expect(fragment.children.length).toBe(1)

    const node = fragment.children[0]!
    expect(node.type).toBe('Text')
    expect(node.data).toBe('<custom-tag></custom-tag>')
  })

  it('fails if there is no closing tag', async () => {
    const action = () => parse(`<${TAG_NAMES.message}>`)

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('unclosed-block')
  })

  it('fails if the tag is not opened', async () => {
    const action = () => parse(`</${TAG_NAMES.message}>`)

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('unexpected-tag-close')
  })

  it('fails if the tag is not closed', async () => {
    const action = () => parse(`<${TAG_NAMES.message}`)

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('unexpected-eof')
  })

  it('Parses tags within tags', async () => {
    const fragment = parse(
      `<${TAG_NAMES.message}><${TAG_NAMES.content}/></${TAG_NAMES.message}>`,
    )
    expect(fragment.children.length).toBe(1)

    const parent = fragment.children[0]!
    expect(parent.type).toBe('ElementTag')
    expect(parent.name).toBe(TAG_NAMES.message)
    expect(parent.children?.length).toBe(1)

    const child = parent.children![0]!
    expect(child.type).toBe('ElementTag')
    expect(child.name).toBe(TAG_NAMES.content)
  })

  it('parses all attributes', async () => {
    const fragment = parse(
      `<${TAG_NAMES.message} attr1="value1" attr2="value2" />`,
    )
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe(TAG_NAMES.message)
    expect(tag.attributes.length).toBe(2)

    const attr1 = tag.attributes[0]!
    expect(attr1.type).toBe('Attribute')
    expect(attr1.name).toBe('attr1')
    const value1 = attr1.value as TemplateNode[]
    expect(value1.length).toBe(1)
    expect(value1[0]!.type).toBe('Text')
    expect(value1[0]!.data).toBe('value1')

    const attr2 = tag.attributes[1]!
    expect(attr2.type).toBe('Attribute')
    expect(attr2.name).toBe('attr2')
    const value2 = attr2.value as TemplateNode[]
    expect(value2.length).toBe(1)
    expect(value2[0]!.type).toBe('Text')
    expect(value2[0]!.data).toBe('value2')
  })

  it('Parses attribute vales as expressions when interpolated', async () => {
    const fragment = parse(
      `<${TAG_NAMES.message} attr=${CUSTOM_TAG_START}value${CUSTOM_TAG_END} />`,
    )
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe(TAG_NAMES.message)
    expect(tag.attributes.length).toBe(1)

    const attr = tag.attributes[0]!
    expect(attr.type).toBe('Attribute')
    expect(attr.name).toBe('attr')
    const value = attr.value as TemplateNode[]
    expect(value.length).toBe(1)
    expect(value[0]!.type).toBe('MustacheTag')
    expect(value[0]!.expression).toBeTruthy()
  })

  it('Parses attributes with no value as true', async () => {
    const fragment = parse(`<${TAG_NAMES.message} attr />`)
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe(TAG_NAMES.message)
    expect(tag.attributes.length).toBe(1)

    const attr = tag.attributes[0]!
    expect(attr.type).toBe('Attribute')
    expect(attr.name).toBe('attr')
    expect(attr.value).toBe(true)
  })

  it('Fails when adding a duplicate attribute', async () => {
    const action = () =>
      parse(`<${TAG_NAMES.message} attr="value1" attr="value2" />`)

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('duplicate-attribute')
  })
})
