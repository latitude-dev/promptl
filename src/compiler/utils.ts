import { ZodError, core } from 'zod'
import { TAG_NAMES } from '$promptl/constants'
import {
  ChainStepTag,
  ContentTag,
  ElementTag,
  MessageTag,
  ReferenceTag,
  ScopeTag,
} from '$promptl/parser/interfaces'
import { ContentTypeTagName } from '$promptl/types'
import type { MessageRole } from '$promptl/types'
import { Scalar, Node as YAMLItem, YAMLMap, YAMLSeq } from 'yaml'

type ZodIssue = core.$ZodIssue

export function isIterable(obj: unknown): obj is Iterable<unknown> {
  return (obj as Iterable<unknown>)?.[Symbol.iterator] !== undefined
}

export async function hasContent(iterable: Iterable<unknown>) {
  for await (const _ of iterable) {
    return true
  }
  return false
}

export function getCommonIndent(text: string): number {
  return (
    text.split('\n').reduce((acc: number | null, line: string) => {
      if (line.trim() === '') return acc
      const indent = line.match(/^\s*/)![0]
      if (acc === null) return indent.length
      return indent.length < acc ? indent.length : acc
    }, null) ?? 0
  )
}

export function removeCommonIndent(text: string): string {
  const indent = getCommonIndent(text)
  return text
    .split('\n')
    .map((line) => line.slice(indent))
    .join('\n')
    .trim()
}

export function isMessageTag(tag: ElementTag): tag is MessageTag {
  if (tag.name === TAG_NAMES.message) return true
  return ['assistant', 'developer', 'system', 'tool', 'user'].includes(
    tag.name as MessageRole,
  )
}

export function isContentTag(tag: ElementTag): tag is ContentTag {
  if (tag.name === TAG_NAMES.content) return true
  return Object.values(ContentTypeTagName).includes(
    tag.name as ContentTypeTagName,
  )
}

export function isRefTag(tag: ElementTag): tag is ReferenceTag {
  return tag.name === TAG_NAMES.prompt
}

export function isChainStepTag(tag: ElementTag): tag is ChainStepTag {
  return tag.name === TAG_NAMES.step
}

export function isScopeTag(tag: ElementTag): tag is ScopeTag {
  return tag.name === TAG_NAMES.scope
}

export function tagAttributeIsLiteral(tag: ElementTag, name: string): boolean {
  const attr = tag.attributes.find((attr) => attr.name === name)
  if (!attr) return false
  if (attr.value === true) return true
  return attr.value.every((v) => v.type === 'Text')
}

type YAMLItemRange = [number, number] | undefined
export function findYAMLItemPosition(
  parent: YAMLItem,
  path: PropertyKey[],
): YAMLItemRange {
  const parentRange: YAMLItemRange = parent?.range
    ? [parent.range[0], parent.range[1]]
    : undefined

  if (!parentRange || path.length === 0 || !('items' in parent)) {
    return parentRange
  }

  let child: YAMLItem | undefined
  if (parent instanceof YAMLMap) {
    child = parent.items.find((i) => {
      return (i.key as Scalar)?.value === path[0]!
    })?.value as YAMLItem | undefined
  }
  if (parent instanceof YAMLSeq && typeof path[0] === 'number') {
    child = parent.items[Number(path[0])] as YAMLItem | undefined
  }

  if (!child) return parentRange
  return findYAMLItemPosition(child, path.slice(1)) ?? parentRange
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError
}

function collectAllLeafIssues(issue: ZodIssue): ZodIssue[] {
  if (issue.code === 'invalid_union') {
    issue.errors
    return issue.errors.flatMap((issues) =>
      issues.flatMap(collectAllLeafIssues),
    )
  }
  return [issue]
}

function getZodIssueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': {
      const attr = issue.path.at(-1)
      return typeof attr === 'string'
        ? `Expected type \`${issue.expected}\` for attribute "${attr}", but received \`${issue.input}\`.`
        : `Expected type \`${issue.expected}\`, but received \`${issue.input}\`.`
    }

    case 'invalid_value': {
      const attr = issue.path.at(-1)
      const literalValues = issue.values.join(', ')
      return typeof attr === 'string'
        ? `Expected literal \`${literalValues}\` for attribute "${attr}", but received \`${issue.input}\`.`
        : `Expected literal \`${literalValues}\`, but received \`${issue.input}\`.`
    }

    case 'unrecognized_keys':
      return `Unrecognized keys: ${issue.keys.join(', ')}.`

    case 'invalid_union':
      return `Invalid union: ${issue.message}`

    case 'too_small':
      return `Value is too small: ${issue.message || 'Value does not meet minimum size.'}`

    case 'too_big':
      return `Value is too big: ${issue.message || 'Value exceeds maximum size.'}`

    case 'not_multiple_of':
      return `Value is not a multiple of ${issue.divisor}: ${issue.message || 'Value does not meet multiple of condition.'}`

    case 'custom':
      return `Custom validation error: ${issue.message || 'No additional message provided.'}`

    case 'invalid_key':
      return `Invalid key: ${issue.message || 'Key validation failed.'}`

    case 'invalid_format':
      return `Invalid format: ${issue.message || `Expected format ${issue.format}.`}`

    case 'invalid_element':
      return `Invalid element: ${issue.message || 'Element validation failed.'}`

    default:
      // The types are exhaustive, but we don't want to miss any new ones
      return 'Unknown validation error.'
  }
}

export function getMostSpecificError(error: ZodIssue): {
  message: string
  path: PropertyKey[]
} {
  const allIssues = collectAllLeafIssues(error)
  const mostSpecific = allIssues.reduce(
    (acc, cur) => (cur.path.length > acc.path.length ? cur : acc),
    allIssues[0]!,
  )
  return {
    message: getZodIssueMessage(mostSpecific),
    path: mostSpecific.path,
  }
}
