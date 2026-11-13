// @ts-check
import { fileURLToPath } from 'node:url'
import withNuxt from './.nuxt/eslint.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const LAYER_BOUNDARY_SELECTORS = [
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
  {
    selector: ":matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression)[source.value=/^~~\\/layers\\/(core|admin|public)\\//]",
    message: 'Absolute `~~/layers/...` imports must not cross a layer; use #kestrel-core/... or #kestrel-admin/... instead.',
  },
]

const ADMIN_ROUTE_SELECTORS = [
  {
    selector: "CallExpression[callee.name='useApi']",
    message: 'Admin code calls the API through useAdminApi() with a route from useCapabilities().',
  },
  {
    selector: "CallExpression:matches([callee.name=/^(api|transport)$/], [callee.property.name=/^(api|transport)$/]) > :matches(Literal, TemplateLiteral)",
    message: 'Pass a route from useCapabilities(), not a path literal.',
  },
  {
    selector: "ObjectExpression > Property[key.name='path'] ~ Property[key.name='method']",
    message: 'Routes come from useCapabilities() or ADMIN_BOOTSTRAP_ROUTES/LAYER_ROUTES, not from an object literal.',
  },
  {
    selector: "ObjectExpression > Property[key.name='method'] ~ Property[key.name='path']",
    message: 'Routes come from useCapabilities() or ADMIN_BOOTSTRAP_ROUTES/LAYER_ROUTES, not from an object literal.',
  },
  {
    selector: ":matches(Literal[value=/^\\/api(\\/|$)/], TemplateElement[value.raw=/^\\/api(\\/|$)/])",
    message: 'API URLs come from apiUrl() in utils/capabilities.ts.',
  },
  {
    selector: "ObjectExpression:has(> SpreadElement):has(> Property[key.name='path'])",
    message: 'A route object built by spreading another route and overriding `path` still bypasses useCapabilities(); resolve a real capability instead.',
  },
  {
    selector: "ImportSpecifier[imported.name='useApi']",
    message: 'Do not import useApi (even renamed); admin code calls the API through useAdminApi() with a route from useCapabilities().',
  },
]

const ADMIN_FETCH_SELECTORS = [
  {
    selector: ":matches(CallExpression[callee.name=/^(\\$fetch|useFetch|fetch)$/], CallExpression[callee.object.name='$fetch'], CallExpression[callee.object.type='MemberExpression'][callee.object.object.name='globalThis'][callee.object.property.name='$fetch'], CallExpression[callee.type='MemberExpression'][callee.object.name='globalThis'][callee.property.name='$fetch'], NewExpression[callee.name='XMLHttpRequest'])",
    message: 'Admin code calls the API through useAdminApi()/useUploadTransport(), never $fetch, useFetch(), fetch(), globalThis.$fetch or XMLHttpRequest directly.',
  },
]

const ADMIN_MOUNT_PATH_SELECTOR = [
  {
    selector: "ImportSpecifier[imported.name='MOUNT_PATH']",
    message: 'MOUNT_PATH is a routing primitive for the few files that build routes or URLs directly; everything else goes through useCapabilities()/useAdminApi().',
  },
]

export default withNuxt(
  { ignores: ['!**/layers/public/**'] },
  { name: 'kestrel/lint-fixtures-ignore', ignores: ['**/__lint_fixtures__/**', 'layers/core/lint-fixture-type-aware.ts'] },
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
      'no-restricted-syntax': ['error', ...LAYER_BOUNDARY_SELECTORS],
    },
  },
  {
    name: 'kestrel/admin-api-routes',
    files: ['layers/admin/app/**/*.{ts,vue}'],
    ignores: [
      '**/*.test.ts',
      '**/__fixtures__/**',
      'layers/admin/app/utils/capabilities.ts',
      'layers/admin/app/composables/useAdminApi.ts',
      'layers/admin/app/composables/useApi.ts',
      'layers/admin/app/composables/useAuth.ts',
      'layers/admin/app/composables/useSchema.ts',
      'layers/admin/app/composables/useUploadTransport.ts',
      'layers/admin/app/utils/admin-client.ts',
      'layers/admin/app/utils/reauth.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...LAYER_BOUNDARY_SELECTORS, ...ADMIN_ROUTE_SELECTORS, ...ADMIN_FETCH_SELECTORS, ...ADMIN_MOUNT_PATH_SELECTOR],
    },
  },
  {
    name: 'kestrel/ui-kit-first',
    files: ['layers/admin/app/**/*.vue'],
    ignores: ['layers/admin/app/components/ui/**'],
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
        { patterns: [{ regex: '^(?!@michaelthielemann/kestrel-renderer-nuxt/static-marker$|@michaelthielemann/kestrel-delivery-static/site-url$|@michaelthielemann/kestrel-images-default/framing$)@michaelthielemann/kestrel(-[a-z0-9-]+)?(/.*)?$', allowTypeImports: false, message: 'UI code does not import Kestrel backend packages; take types from #kestrel-core/app/types/api.' }] },
      ],
    },
  },
  {
    name: 'kestrel/backend-types-only-in-core-app-types',
    files: ['layers/core/app/types/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^@michaelthielemann/kestrel(-[a-z0-9-]+)?/(.*/)?impl(/.*)?$', allowTypeImports: false, message: 'layers/core/app/types takes its types from the generated OpenAPI document (./openapi.generated), not from a backend package\'s impl subpath.' },
            { regex: '^@michaelthielemann/kestrel(-[a-z0-9-]+)?(?!.*/impl(/|$))(/.+)?$', allowTypeImports: true, message: 'layers/core/app/types may import Kestrel backend packages as types only.' },
          ],
        },
      ],
    },
  },
  {
    name: 'kestrel/type-aware',
    files: ['layers/*/app/**/*.{ts,vue}', 'playground/app/**/*.{ts,vue}', 'packages/create-kestrel/**/*.ts', 'layers/core/*.ts'],
    ignores: [
      '**/*.d.ts',
      'packages/create-kestrel/template/**',
      'packages/create-kestrel/prompts.test.ts',
      'packages/create-kestrel/scaffold.e2e.test.ts',
      'packages/create-kestrel/template.test.ts',
    ],
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
