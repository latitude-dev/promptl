import { expect } from 'vitest'

export async function getExpectedError<T extends Error>(
  action: () => unknown,
  errorClass: new (...args: any[]) => T,
): Promise<T> {
  try {
    await action()
  } catch (err) {
    expect(err).toBeInstanceOf(errorClass)
    return err as T
  }
  throw new Error('Expected an error to be thrown')
}
