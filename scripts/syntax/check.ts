#!/usr/bin/env tsx
/**
 * Syntax check script for PromptL files
 *
 * Usage:
 *   pnpm check <path> [--ext <extension>]
 *
 * Arguments:
 *   path         Relative path to directory containing PromptL files
 *   --ext        File extension to check (default: .promptl)
 *
 * Example:
 *   pnpm check ./prompts
 *   pnpm check ./prompts --ext .txt
 *
 * Prompts can reference each other using <prompt path="..." /> tags.
 * References are resolved relative to the current file's directory.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { scan, CompileError } from 'promptl-ai'

interface Document {
  path: string
  content: string
}

interface SyntaxError {
  file: string
  line: number
  column: number
  code: string
  message: string
  frame: string
}

interface CheckResult {
  filesChecked: number
  filesWithErrors: number
  totalErrors: number
  errors: SyntaxError[]
}

function parseArgs(): { targetPath: string; extension: string } {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Error: Please provide a path to check')
    console.error('Usage: pnpm check <path> [--ext <extension>]')
    process.exit(1)
  }

  const targetPath = args[0]!
  let extension = '.promptl'

  const extIndex = args.indexOf('--ext')
  if (extIndex !== -1 && args[extIndex + 1]) {
    extension = args[extIndex + 1]!
    if (!extension.startsWith('.')) {
      extension = `.${extension}`
    }
  }

  return { targetPath, extension }
}

function findFiles(dir: string, extension: string): string[] {
  const files: string[] = []

  if (!fs.existsSync(dir)) {
    console.error(`Error: Path does not exist: ${dir}`)
    process.exit(1)
  }

  const stat = fs.statSync(dir)
  if (stat.isFile()) {
    if (dir.endsWith(extension)) {
      return [dir]
    }
    console.error(`Error: File does not have ${extension} extension: ${dir}`)
    process.exit(1)
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, extension))
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Build a map of all prompt files for reference resolution.
 * Keys are relative paths from the base directory (without extension).
 */
function buildPromptMap(
  files: string[],
  baseDir: string,
  extension: string,
): Map<string, string> {
  const prompts = new Map<string, string>()

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    // Store with full path for absolute resolution
    prompts.set(file, content)
    // Also store with relative path (without extension) for relative resolution
    const relativePath = path.relative(baseDir, file)
    const relativeWithoutExt = relativePath.replace(new RegExp(`${extension.replace('.', '\\.')}$`), '')
    prompts.set(relativeWithoutExt, content)
  }

  return prompts
}

/**
 * Create a reference function that resolves prompt references.
 * Supports both relative paths (from current file) and paths from base directory.
 */
function createReferenceFn(
  prompts: Map<string, string>,
  baseDir: string,
  extension: string,
): (relativePath: string, currentAbsolutePath?: string) => Promise<Document | undefined> {
  return async (
    relativePath: string,
    currentAbsolutePath?: string,
  ): Promise<Document | undefined> => {
    // Try to resolve the path relative to the current file
    let resolvedPath: string

    if (currentAbsolutePath) {
      // Get the directory of the current file
      const currentDir = path.dirname(currentAbsolutePath)
      // Resolve the relative path from the current file's directory
      resolvedPath = path.resolve(currentDir, relativePath)
    } else {
      // No current path, resolve from base directory
      resolvedPath = path.resolve(baseDir, relativePath)
    }

    // Try with and without extension
    const pathsToTry = [
      resolvedPath,
      resolvedPath + extension,
    ]

    for (const tryPath of pathsToTry) {
      if (prompts.has(tryPath)) {
        return {
          path: tryPath,
          content: prompts.get(tryPath)!,
        }
      }
    }

    // Also try as a relative path from base directory
    const relativeFromBase = path.relative(baseDir, resolvedPath)
    const relativePathsToTry = [
      relativeFromBase,
      relativeFromBase.replace(new RegExp(`${extension.replace('.', '\\.')}$`), ''),
    ]

    for (const tryPath of relativePathsToTry) {
      if (prompts.has(tryPath)) {
        return {
          path: path.resolve(baseDir, tryPath + extension),
          content: prompts.get(tryPath)!,
        }
      }
    }

    return undefined
  }
}

async function checkFile(
  filePath: string,
  referenceFn: (relativePath: string, currentAbsolutePath?: string) => Promise<Document | undefined>,
): Promise<SyntaxError[]> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const result = await scan({
    prompt: content,
    fullPath: filePath,
    referenceFn,
  })

  return result.errors.map((error: CompileError) => ({
    file: filePath,
    line: error.start?.line ?? 0,
    column: error.start?.column ?? 0,
    code: error.code,
    message: error.message,
    frame: error.frame,
  }))
}

async function main(): Promise<void> {
  const { targetPath, extension } = parseArgs()
  const absolutePath = path.resolve(process.cwd(), targetPath)
  const files = findFiles(absolutePath, extension)

  if (files.length === 0) {
    console.log(`No ${extension} files found in ${targetPath}`)
    process.exit(0)
  }

  console.log(`Checking ${files.length} file(s) with extension ${extension}...\n`)

  // Build prompt map for reference resolution
  const baseDir = fs.statSync(absolutePath).isDirectory() ? absolutePath : path.dirname(absolutePath)
  const prompts = buildPromptMap(files, baseDir, extension)
  const referenceFn = createReferenceFn(prompts, baseDir, extension)

  const result: CheckResult = {
    filesChecked: files.length,
    filesWithErrors: 0,
    totalErrors: 0,
    errors: [],
  }

  const filesWithErrors = new Set<string>()

  for (const file of files) {
    const errors = await checkFile(file, referenceFn)
    if (errors.length > 0) {
      filesWithErrors.add(file)
      result.errors.push(...errors)
    }
  }

  result.filesWithErrors = filesWithErrors.size
  result.totalErrors = result.errors.length

  // Print results
  if (result.totalErrors === 0) {
    console.log('✓ No syntax errors found')
  } else {
    console.log(`Found ${result.totalErrors} error(s) in ${result.filesWithErrors} file(s):\n`)

    for (const error of result.errors) {
      const relativePath = path.relative(process.cwd(), error.file)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`File: ${relativePath}`)
      console.log(`Location: Line ${error.line}, Column ${error.column}`)
      console.log(`Error [${error.code}]: ${error.message}`)
      if (error.frame) {
        console.log(`\n${error.frame}`)
      }
      console.log()
    }
  }

  // Summary
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Summary:`)
  console.log(`  Files checked: ${result.filesChecked}`)
  console.log(`  Files with errors: ${result.filesWithErrors}`)
  console.log(`  Total errors: ${result.totalErrors}`)

  // Output JSON to stderr for programmatic use
  console.error('\n--- JSON Output ---')
  console.error(JSON.stringify(result, null, 2))

  // Exit with error code if there are errors
  process.exit(result.totalErrors > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
