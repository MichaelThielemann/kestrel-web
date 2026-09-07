// @ts-check
import { fileURLToPath } from 'node:url'
import withNuxt from './.nuxt/eslint.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default withNuxt(
  { ignores: ['!**/layers/public/**'] },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/html-self-closing': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression > TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']",
          message: '`as unknown as T` is banned; use boundaryCast<T>(value, boundary) from #kestrel/cast at a JSON, AST, DOM or host boundary.',
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
          message: '`as any` is banned.',
        },
      ],
    },
  },
  {
    name: 'kestrel/type-aware',
    files: ['layers/core/server/**/*.ts', 'layers/core/pipelines/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['playground/.nuxt/tsconfig.server.json', 'playground/tsconfig.json'],
        tsconfigRootDir: repoRoot,
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
)
