import typescriptEslintEslintPlugin from '@typescript-eslint/eslint-plugin'
import prettier from 'eslint-plugin-prettier'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: ['**/.*.js', '**/node_modules/', '**/dist/'],
  },
  ...compat.extends('eslint:recommended'),
  {
    plugins: {
      '@typescript-eslint': typescriptEslintEslintPlugin,
      'prettier': prettier,
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },

      parser: tsParser,
    },

    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },

    rules: {
      'no-constant-condition': 'off',
      'no-unused-vars': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
  },
]
