import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import execute from 'rollup-plugin-execute'

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

/** @type {import('rollup').RollupOptions} */
export default {
  onwarn: (warning, warn) => {
    if (!isInternalCircularDependency(warning)) warn(warning)
  },
  input: 'src/index.rpc.ts',
  output: [
    {
      file: 'dist/promptl.js',
      format: 'es',
    },
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    commonjs(),
    typescript({
      noEmit: true,
      tsconfig: './tsconfig.json',
      exclude: ['**/__tests__', '**/*.test.ts'],
    }),
    execute([
      [
        'javy build',
        '-C dynamic=n',
        '-C source-compression=y',
        '-J javy-stream-io=y',
        '-J simd-json-builtins=y',
        '-J text-encoding=y',
        '-J event-loop=y',
        '-o dist/promptl.wasm',
        'dist/promptl.js',
      ].join(' '),
    ]),
  ],
}
