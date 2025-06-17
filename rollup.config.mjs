import * as path from 'path'
import * as url from 'url'

import alias from '@rollup/plugin-alias'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'

/**
 * We have a internal circular dependency in the compiler,
 * which is intentional. We think in this case Rollup is too noisy.
 *
 * @param {import('rollup').RollupLog} warning
 * @returns {boolean}
 */
function isInternalCircularDependency(warning) {
  return (
    warning.code == 'CIRCULAR_DEPENDENCY' &&
    warning.message.includes('src/compiler') &&
    !warning.message.includes('node_modules')
  )
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const aliasEntries = {
  entries: [{ find: '$promptl', replacement: path.resolve(__dirname, 'src') }],
}

/** @type {import('rollup').RollupOptions} */
export default [
  {
    onwarn: (warning, warn) => {
      if (isInternalCircularDependency(warning)) return

      warn(warning)
    },
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.js' },
      { file: 'dist/index.cjs', format: 'cjs' },
    ],
    plugins: [
      nodeResolve(),
      typescript({
        noEmit: true,
        tsconfig: './tsconfig.json',
        exclude: ['**/__tests__', '**/*.test.ts'],
      }),
    ],
    external: [
      'openai',
      'acorn',
      'node:crypto',
      'yaml',
      'crypto',
      'zod',
      'fast-sha256',
    ],
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [
      alias(aliasEntries),
      dts({
        tsconfig: './tsconfig.json',
        exclude: ['**/__tests__', '**/*.test.ts'],
      }),
    ],
  },
]
