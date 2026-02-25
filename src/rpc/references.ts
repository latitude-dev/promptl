import type { Document, ReferencePromptFn } from '../compiler/types'

function dirname(filepath: string): string {
  const idx = filepath.lastIndexOf('/')
  if (idx < 0) return ''
  return filepath.slice(0, idx)
}

function normalizePath(filepath: string): string {
  const parts = filepath.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      resolved.pop()
    } else {
      resolved.push(part)
    }
  }
  return resolved.join('/')
}

function resolvePath(refPath: string, from?: string): string {
  if (!from) return normalizePath(refPath)
  const dir = dirname(from)
  if (!dir) return normalizePath(refPath)
  return normalizePath(dir + '/' + refPath)
}

export function buildReferenceFn(
  references?: Record<string, string>,
): ReferencePromptFn | undefined {
  if (!references) return undefined
  return async (path: string, from?: string): Promise<Document | undefined> => {
    const resolved = resolvePath(path, from)
    const content = references[resolved]
    if (content === undefined) return undefined
    return { path: resolved, content }
  }
}
