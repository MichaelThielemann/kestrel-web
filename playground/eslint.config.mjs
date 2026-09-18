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
    name: 'kestrel/layer-boundaries',
    files: ['layers/**/*.{ts,vue}', 'packages/**/*.{ts,vue}', 'playground/**/*.{ts,vue}'],
    rules: {
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
        {
          selector: ":matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression)[source.value=/^(\\.\\.\\/)+(core|admin|public)\\//]",
          message: 'Relative imports must not cross a layer; use #kestrel-core/... or #kestrel-admin/... instead.',
        },
      ],
    },
  },
  {
    name: 'kestrel/ui-kit-first',
    files: ['layers/admin/app/**/*.vue'],
    ignores: ['layers/admin/app/components/ui/**', 'layers/admin/app/pages/admin/system.vue'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'vue/comment-directive': 'off',
      'vue/no-v-html': 'error',
      'vue/no-restricted-html-elements': [
        'error',
        { element: 'table', message: 'Use KestrelUiTable' },
        { element: 'button', message: 'Use KestrelUiButton' },
        { element: 'input', message: 'Use KestrelUiTextInput/Checkbox/…' },
        { element: 'select', message: 'Use KestrelUiSelect' },
        { element: 'textarea', message: 'Use KestrelUiTextarea' },
        { element: 'dialog', message: 'Use KestrelUiDialog' },
      ],
      'vue/no-restricted-static-attribute': [
        'error',
        { key: 'role', value: 'button', message: 'Use KestrelUiButton instead of role="button"' },
        { key: 'href', value: '#', element: 'a', message: 'A link that goes nowhere is a button: use KestrelUiButton' },
        { key: 'is', element: 'component', value: '/^(table|button|input|select|textarea|dialog)$/i', message: 'Use the KestrelUi* component' },
      ],
      'vue/no-restricted-class': ['error', '/^ui-button(--|$)/'],
      'vue/no-restricted-syntax': [
        'error',
        {
          selector: "VElement[name=/^(table|button|input|select|textarea|dialog)$/]:not([rawName=/^(table|button|input|select|textarea|dialog)$/])",
          message: 'Raw control in mixed case: use the KestrelUi* component',
        },
        {
          selector: "VElement[name='component'] > VStartTag > VAttribute[directive=true][key.name.name='bind'][key.argument.name='is'] > VExpressionContainer > Literal[value=/^(table|button|input|select|textarea|dialog)$/i]",
          message: 'Use the KestrelUi* component',
        },
        {
          selector: "VAttribute[directive=true][key.name.name='bind'][key.argument.name='role'] > VExpressionContainer > Literal[value='button']",
          message: 'Use KestrelUiButton instead of :role="\'button\'"',
        },
      ],
    },
  },
  {
    name: 'kestrel/no-admin-from-public-or-core',
    files: ['layers/public/**/*.{ts,vue}', 'layers/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['\\#kestrel-admin/*'], message: 'Only layers/admin may import #kestrel-admin/*.' }] }],
    },
  },
  {
    name: 'kestrel/no-backend-in-ui-layers',
    files: ['layers/admin/**/*.{ts,vue}', 'layers/public/**/*.{ts,vue}', 'layers/core/app/**/*.{ts,vue}', 'playground/app/**/*.{ts,vue}'],
    ignores: ['layers/core/app/types/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@michaelthielemann/kestrel', '@michaelthielemann/kestrel/*', '@michaelthielemann/kestrel-*'], allowTypeImports: false, message: 'UI code does not import Kestrel backend packages; take types from #kestrel-core/app/types/api.' }] },
      ],
    },
  },
  {
    name: 'kestrel/backend-types-only-in-core-app-types',
    files: ['layers/core/app/types/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@michaelthielemann/kestrel', '@michaelthielemann/kestrel/*', '@michaelthielemann/kestrel-*'], allowTypeImports: true, message: 'layers/core/app/types may import Kestrel backend packages as types only.' }] },
      ],
    },
  },
  {
    name: 'kestrel/type-aware',
    files: ['layers/*/app/**/*.{ts,vue}', 'playground/app/**/*.{ts,vue}'],
    ignores: ['**/*.d.ts'],
    languageOptions: {
      parserOptions: {
        project: ['playground/.nuxt/tsconfig.app.json', 'playground/tsconfig.json'],
        tsconfigRootDir: repoRoot,
        extraFileExtensions: ['.vue'],
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
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    name: 'kestrel/type-aware-server',
    files: [
      'layers/*/server/**/*.ts',
      'layers/*/pipelines/**/*.ts',
      'layers/*/config/**/*.ts',
      'layers/*/collections-ui/**/*.ts',
      'layers/*/module-registry/**/*.ts',
      'layers/*/schemas/**/*.ts',
      'layers/*/modules/**/*.ts',
      'layers/*/nuxt.config.ts',
      'packages/renderer-nuxt/**/*.ts',
      'playground/shared/**/*.ts',
      'playground/*.ts',
    ],
    ignores: ['**/*.d.ts'],
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
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
)
