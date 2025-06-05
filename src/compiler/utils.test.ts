import { describe, it, expect } from 'vitest'
import { ZodError, ZodIssue, ZodIssueCode, z } from 'zod'
import { getMostSpecificError } from './utils'

function makeZodError(issues: ZodIssue[]): ZodError {
  // @ts-ignore
  return new ZodError(issues)
}

describe('getMostSpecificError', () => {
  it('returns the message and path for a simple error', () => {
    const error = makeZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: 'string',
        received: 'number',
        path: ['foo'],
        message: 'Expected string',
      },
    ])
    const result = getMostSpecificError(error.issues[0]!)
    expect(result.message).toMatch('Expected type')
    expect(result.path).toEqual(['foo'])
  })

  it('returns the most specific (deepest) error in a nested structure', () => {
    const unionError = makeZodError([
      {
        code: ZodIssueCode.invalid_union,
        unionErrors: [
          makeZodError([
            {
              code: ZodIssueCode.invalid_type,
              expected: 'string',
              received: 'number',
              path: ['foo', 'bar'],
              message: 'Expected string',
            },
          ]),
          makeZodError([
            {
              code: ZodIssueCode.invalid_type,
              expected: 'number',
              received: 'string',
              path: ['foo'],
              message: 'Expected number',
            },
          ]),
        ],
        path: ['foo'],
        message: 'Invalid union',
      },
    ])
    const result = getMostSpecificError(unionError.issues[0]!)
    expect(result.path).toEqual(['foo', 'bar'])
    expect(result.message).toMatch('Expected type')
  })

  it('returns the error message and empty path if no issues', () => {
    const error = makeZodError([
      {
        code: ZodIssueCode.custom,
        path: [],
        message: 'Custom error',
      },
    ])
    const result = getMostSpecificError(error.issues[0]!)
    expect(result.message).toMatch('Custom error')
    expect(result.path).toEqual([])
  })

  it('handles errors with multiple paths and picks the deepest', () => {
    const error = makeZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: 'string',
        received: 'number',
        path: ['a'],
        message: 'Expected string',
      },
      {
        code: ZodIssueCode.invalid_type,
        expected: 'number',
        received: 'string',
        path: ['a', 'b', 'c'],
        message: 'Expected number',
      },
    ])
    const result = getMostSpecificError(error.issues[1]!) // The deepest path is at index 1
    expect(result.path).toEqual(['a', 'b', 'c'])
    expect(result.message).toMatch('Expected type')
  })

  it('handles ZodError thrown by zod schema', () => {
    const schema = z.object({ foo: z.string() })
    let error: ZodError | undefined
    try {
      schema.parse({ foo: 123 })
    } catch (e) {
      error = e as ZodError
    }
    expect(error).toBeDefined()
    expect(error!.issues.length).toBeGreaterThan(0)
    const result = getMostSpecificError(error!.issues[0]!)
    expect(result.path).toEqual(['foo'])
    expect(result.message).toMatch('Expected type')
  })
})
