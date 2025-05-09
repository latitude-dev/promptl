import { CUSTOM_TAG_START, RESERVED_TAGS } from '$promptl/constants'
import { type Parser } from '$promptl/parser'
import type { Text } from '$promptl/parser/interfaces'

const RESERVED_DELIMITERS = [CUSTOM_TAG_START, '/*', '<!--']
const WHITESPACE_CHARS = [' ', '\n', '\r', '\t']

function matchesReservedTag(template: string, index: number): boolean {
  if (template[index] !== '<') return false

  const isClosingTag = template[index + 1] === '/'
  let tagStart = index + (isClosingTag ? 2 : 1)

  for (const tag of RESERVED_TAGS) {
    if (
      template.startsWith(tag, tagStart) &&
      (WHITESPACE_CHARS.includes(template[tagStart + tag.length] as string) ||
        template[tagStart + tag.length] === '/' ||
        template[tagStart + tag.length] === '>' ||
        tagStart + tag.length === template.length)
    ) {
      return true
    }
  }

  return false
}

export function text(parser: Parser) {
  const start = parser.index
  let data = ''
  const template = parser.template
  const len = template.length

  while (parser.index < len) {
    const char = template[parser.index]

    let isEscaping = false
    let backslashCount = 0
    for (let i = data.length - 1; i >= 0 && data[i] === '\\'; i--)
      backslashCount++
    isEscaping = backslashCount % 2 === 1
    if (isEscaping) data = data.slice(0, -1)

    if (!isEscaping) {
      if (
        char === '-' &&
        template[parser.index + 1] === '-' &&
        template[parser.index + 2] === '-' &&
        template[parser.index + 3] !== '-'
      ) {
        break
      }

      let delimiterMatched = false
      for (const delim of RESERVED_DELIMITERS) {
        if (template.startsWith(delim, parser.index)) {
          delimiterMatched = true
          break
        }
      }
      if (delimiterMatched) break

      if (matchesReservedTag(template, parser.index)) break
    }

    if (char === '-') {
      let dashEnd = parser.index + 1
      while (dashEnd < len && template[dashEnd] === '-') dashEnd++
      const dashCount = dashEnd - parser.index
      data += '-'.repeat(dashCount)
      parser.index = dashEnd
    } else {
      data += char
      parser.index++
    }
  }

  const node = {
    start,
    end: parser.index,
    type: 'Text',
    raw: data,
    data: data.replace(/(?<!\\)\\{{/g, '{{').replace(/(?<!\\)\\}}/g, '}}'),
  } as Text

  parser.current().children!.push(node)
}
