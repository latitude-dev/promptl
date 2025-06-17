import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, beforeAll } from 'vitest'

const DIST_DIR = join(process.cwd(), 'dist')
const CJS_FILE = join(DIST_DIR, 'index.cjs')
const ESM_FILE = join(DIST_DIR, 'index.js')
const DTS_FILE = join(DIST_DIR, 'index.d.ts')

describe('Build Output Verification', () => {
  beforeAll(() => {
    // Ensure build exists
    if (!existsSync(DIST_DIR)) {
      execSync('pnpm build', { stdio: 'inherit' })
    }
  })

  it('should generate all required build files', () => {
    expect(existsSync(CJS_FILE)).toBe(true)
    expect(existsSync(ESM_FILE)).toBe(true)
    expect(existsSync(DTS_FILE)).toBe(true)
  })

  it('should generate valid CommonJS format', () => {
    const cjsContent = readFileSync(CJS_FILE, 'utf8')
    
    // Should start with 'use strict'
    expect(cjsContent).toMatch(/^'use strict'/)
    
    // Should use require() for dependencies
    expect(cjsContent).toMatch(/require\(['"]/)
    
    // Should not contain ES6 import statements
    expect(cjsContent).not.toMatch(/^import\s+/)
  })

  it('should generate valid ES module format', () => {
    const esmContent = readFileSync(ESM_FILE, 'utf8')
    
    // Should use import statements
    expect(esmContent).toMatch(/^import\s+/)
    
    // Should not contain require() calls
    expect(esmContent).not.toMatch(/require\(['"]/)
  })

  it('should generate TypeScript definitions', () => {
    const dtsContent = readFileSync(DTS_FILE, 'utf8')
    
    // Should contain export declarations
    expect(dtsContent).toMatch(/export\s+/)
    
    // Should contain key function types
    expect(dtsContent).toMatch(/parse/)
    expect(dtsContent).toMatch(/render/)
  })

  it('should load CJS build correctly', async () => {
    // Use dynamic require to avoid bundler issues
    const cjsModule = await import(CJS_FILE)
    
    expect(typeof cjsModule.parse).toBe('function')
    expect(typeof cjsModule.render).toBe('function')
    expect(typeof cjsModule.createChain).toBe('function')
    expect(cjsModule.CompileError).toBeDefined()
    
    // Should have all expected exports
    const exports = Object.keys(cjsModule)
    expect(exports).toContain('parse')
    expect(exports).toContain('render')
    expect(exports).toContain('CompileError')
    expect(exports).toContain('ContentType')
    expect(exports).toContain('MessageRole')
  })

  it('should load ESM build correctly', async () => {
    const esmModule = await import(ESM_FILE)
    
    expect(typeof esmModule.parse).toBe('function')
    expect(typeof esmModule.render).toBe('function')
    expect(typeof esmModule.createChain).toBe('function')
    expect(esmModule.CompileError).toBeDefined()
    
    // Should have all expected exports
    const exports = Object.keys(esmModule)
    expect(exports).toContain('parse')
    expect(exports).toContain('render')
    expect(exports).toContain('CompileError')
    expect(exports).toContain('ContentType')
    expect(exports).toContain('MessageRole')
  })

  it('should have functional parse and render in CJS build', async () => {
    const { parse, render } = await import(CJS_FILE)
    
    const template = 'Hello {{name}}!'
    const parsed = parse(template)
    
    expect(parsed).toBeDefined()
    expect(parsed.type).toBe('Fragment')
    
    const rendered = await render({ 
      prompt: template, 
      parameters: { name: 'World' } 
    })
    
    expect(rendered).toBeDefined()
    expect(rendered.messages).toBeDefined()
    expect(rendered.config).toBeDefined()
    expect(Array.isArray(rendered.messages)).toBe(true)
  })

  it('should have functional parse and render in ESM build', async () => {
    const { parse, render } = await import(ESM_FILE)
    
    const template = 'Hello {{name}}!'
    const parsed = parse(template)
    
    expect(parsed).toBeDefined()
    expect(parsed.type).toBe('Fragment')
    
    const rendered = await render({ 
      prompt: template, 
      parameters: { name: 'World' } 
    })
    
    expect(rendered).toBeDefined()
    expect(rendered.messages).toBeDefined()
    expect(rendered.config).toBeDefined()
    expect(Array.isArray(rendered.messages)).toBe(true)
  })

  it('should have identical exports between CJS and ESM builds', async () => {
    const cjsModule = await import(CJS_FILE)
    const esmModule = await import(ESM_FILE)
    
    // Filter out 'default' export which is expected to differ between CJS and ESM
    const cjsExports = Object.keys(cjsModule).filter(key => key !== 'default').sort()
    const esmExports = Object.keys(esmModule).filter(key => key !== 'default').sort()
    
    expect(cjsExports).toEqual(esmExports)
    expect(cjsExports.length).toBeGreaterThan(10) // Ensure we have substantial exports
  })
})