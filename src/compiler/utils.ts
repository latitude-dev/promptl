import { TAG_NAMES } from '$promptl/constants'
import {
  ChainStepTag,
  ContentTag,
  ElementTag,
  MessageTag,
  ReferenceTag,
  ScopeTag,
} from '$promptl/parser/interfaces'
import { ContentTypeTagName, MessageRole } from '$promptl/types'
import { Scalar, Node as YAMLItem, YAMLMap, YAMLSeq } from 'yaml'
import { ZodError, ZodIssue, ZodIssueCode } from 'zod'

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
  return Object.values(MessageRole).includes(tag.name as MessageRole)
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
  path: (string | number)[],
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
  if (!(error instanceof Error)) return false

  if (error instanceof ZodError) return true
  if (error.constructor.name === 'ZodError') return true
  if ('issues' in error && error.issues instanceof Array) return true

  return false
}

function collectAllLeafIssues(issue: ZodIssue): ZodIssue[] {
  switch (issue.code) {
    case ZodIssueCode.invalid_union: {
      // invalid_union.issue.unionErrors is ZodError[]
      const unionErrs: ZodError[] = (issue as any).unionErrors ?? []
      return unionErrs.flatMap((nestedZodError) =>
        nestedZodError.issues.flatMap((nestedIssue) =>
          collectAllLeafIssues(nestedIssue),
        ),
      )
    }

    case ZodIssueCode.invalid_arguments: {
      // invalid_arguments.issue.argumentsError is ZodError
      const argsErr: ZodError | undefined = (issue as any).argumentsError
      if (argsErr) {
        return argsErr.issues.flatMap((nestedIssue) =>
          collectAllLeafIssues(nestedIssue),
        )
      }
      return [issue]
    }

    case ZodIssueCode.invalid_return_type: {
      // invalid_return_type.issue.returnTypeError is ZodError
      const retErr: ZodError | undefined = (issue as any).returnTypeError
      if (retErr) {
        return retErr.issues.flatMap((nestedIssue) =>
          collectAllLeafIssues(nestedIssue),
        )
      }
      return [issue]
    }

    default:
      // Any other issue code is considered a “leaf” (no deeper nested ZodError)
      return [issue]
  }
}

function getZodIssueMessage(issue: ZodIssue): string {
  if (issue.code === ZodIssueCode.invalid_type) {
    const attribute = issue.path[issue.path.length - 1]
    if (typeof attribute === 'string') {
      return `Expected type \`${issue.expected}\` for attribute "${attribute}", but received \`${issue.received}\`.`
    }

    return `Expected type \`${issue.expected}\`, but received \`${issue.received}\`.`
  }
  if (issue.code === ZodIssueCode.invalid_literal) {
    const attribute = issue.path[issue.path.length - 1]
    if (typeof attribute === 'string') {
      return `Expected literal \`${issue.expected}\` for attribute "${attribute}", but received \`${issue.received}\`.`
    }

    return `Expected literal \`${issue.expected}\`, but received \`${issue.received}\`.`
  }
  if (issue.code === ZodIssueCode.unrecognized_keys) {
    return `Unrecognized keys: ${issue.keys.join(', ')}.`
  }
  if (issue.code === ZodIssueCode.invalid_union) {
    return `Invalid union: ${issue.unionErrors
      .map((err) => err.message)
      .join(', ')}`
  }
  if (issue.code === ZodIssueCode.invalid_union_discriminator) {
    return `Invalid union discriminator. Expected one of: ${issue.options.join(
      ', ',
    )}.`
  }
  if (issue.code === ZodIssueCode.invalid_enum_value) {
    return `Invalid enum value: ${issue.received}. Expected one of: ${issue.options.join(
      ', ',
    )}.`
  }
  if (issue.code === ZodIssueCode.invalid_arguments) {
    return `Invalid arguments: ${issue.argumentsError.issues
      .map((err) => err.message)
      .join(', ')}`
  }
  if (issue.code === ZodIssueCode.invalid_return_type) {
    return `Invalid return type: ${issue.returnTypeError.issues
      .map((err) => err.message)
      .join(', ')}`
  }
  if (issue.code === ZodIssueCode.invalid_date) {
    return `Invalid date: ${issue.message || 'Invalid date format.'}`
  }
  if (issue.code === ZodIssueCode.invalid_string) {
    return `Invalid string: ${issue.message || 'String does not match expected format.'}`
  }
  if (issue.code === ZodIssueCode.too_small) {
    return `Value is too small: ${issue.message || 'Value does not meet minimum size.'}`
  }
  if (issue.code === ZodIssueCode.too_big) {
    return `Value is too big: ${issue.message || 'Value exceeds maximum size.'}`
  }
  if (issue.code === ZodIssueCode.invalid_intersection_types) {
    return `Invalid intersection types: ${issue.message || 'Types do not match.'}`
  }
  if (issue.code === ZodIssueCode.not_multiple_of) {
    return `Value is not a multiple of ${issue.multipleOf}: ${issue.message || 'Value does not meet multiple of condition.'}`
  }
  if (issue.code === ZodIssueCode.not_finite) {
    return `Value is not finite: ${issue.message || 'Value must be a finite number.'}`
  }
  if (issue.code === ZodIssueCode.custom) {
    return `Custom validation error: ${issue.message || 'No additional message provided.'}`
  }
  // For any other issue code, return the message directly
  return (issue as ZodIssue).message || 'Unknown validation error.'
}

export function getMostSpecificError(error: ZodIssue): {
  message: string
  path: (string | number)[]
} {
  const allIssues = collectAllLeafIssues(error)

  if (allIssues.length === 0) {
    return { message: error.message, path: [] }
  }

  let mostSpecific = allIssues[0]!
  for (const issue of allIssues) {
    if (issue.path.length > mostSpecific.path.length) {
      mostSpecific = issue
    }
  }

  return {
    message: getZodIssueMessage(mostSpecific),
    path: mostSpecific.path,
  }
}
