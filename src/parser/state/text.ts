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

  // Track escape state with a boolean instead of recounting backslashes
  let isEscaped = false

  while (parser.index < len) {
    const char = template[parser.index]

    // Handle backslash: toggle escape state and only add it if already escaped
    if (char === '\\' && !isEscaped) {
      isEscaped = true
      parser.index++
      continue
    }

    // If we're in escaped mode, add the current character regardless of what it is
    if (isEscaped) {
      data += char
      parser.index++
      isEscaped = false
      continue
    }

    // Check break conditions (only when not escaped)
    // Only break on --- if config is still possible (not seen yet and no substantive content before)
    const configBlockPattern =
      char === '-' &&
      template[parser.index + 1] === '-' &&
      template[parser.index + 2] === '-' &&
      template[parser.index + 3] !== '-'

    if (
      configBlockPattern &&
      !parser.configSeen &&
      !parser.hasSubstantiveContent
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

    // Handle dashes more efficiently
    if (char === '-') {
      let dashEnd = parser.index + 1
      while (dashEnd < len && template[dashEnd] === '-') dashEnd++
      const dashCount = dashEnd - parser.index
      data += '-'.repeat(dashCount)
      parser.index = dashEnd
    } else {
      // Normal character processing
      data += char
      parser.index++
    }
  }

  // Create the text node with optimized data processing
  // Since we're handling escape characters differently now, we can simplify this replacement
  const node = {
    start,
    end: parser.index,
    type: 'Text',
    raw: data,
    data: data, // The escaping is already handled correctly during parsing
  } as Text

  parser.current().children!.push(node)

  // Mark that we have substantive content if the text contains non-whitespace
  if (data.trim()) {
    parser.hasSubstantiveContent = true
  }
}
