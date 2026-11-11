import comments from '@eslint-community/eslint-plugin-eslint-comments'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import security from 'eslint-plugin-security'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.claude/**',
      '.worktrees/**',
      'docs-site/**',
      'next-env.d.ts',
      'dist/**',
      'build/**',
      'coverage/**',
      'public/**',
      'scripts/**/*.mjs',
      'node_modules/**',
      '*.config.*',
    ],
  },

  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    plugins: {
      'import-x': importX,
      sonarjs,
      security,
      'eslint-comments': comments,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],

      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowNullableObject: true, allowNullableBoolean: true },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-readonly': 'error',

      'import-x/no-unresolved': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/no-self-import': 'error',
      'import-x/no-extraneous-dependencies': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'no-restricted-imports': ['error', { patterns: ['../../../*'] }],

      'no-warning-comments': ['warn', { terms: ['fixme', 'xxx', 'hack'], location: 'anywhere' }],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Inject config at the boundary; do not read process.env deep in modules.',
        },
      ],
      'eslint-comments/require-description': ['error', { ignore: [] }],
      'eslint-comments/no-unlimited-disable': 'error',
      'eslint-comments/no-unused-disable': 'error',

      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement > NewExpression[callee.name="Error"]',
          message:
            'Return Result<T, AppError> instead of throwing raw Error. Use AppError(ErrorIds.X, ...) for programmer errors. See guides/error-id-registry.md.',
        },
      ],

      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 5 }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 3],
      'max-params': ['warn', 4],

      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'warn',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['src/config/env.ts', 'vitest.setup.ts', 'vitest.globalSetup.ts', 'scripts/termGate.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'max-nested-callbacks': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  {
    files: [
      'src/features/anonymousIntake/**/*.{ts,tsx}',
      'src/app/(anonymous)/**/*.{ts,tsx}',
      'src/app/intake/**/*.{ts,tsx}',
    ],
    ignores: [
      '**/*.test.{ts,tsx}',
      'src/features/anonymousIntake/retention*.ts',
      'src/features/anonymousIntake/staffControl.ts',
      'src/features/anonymousIntake/purgeProbe.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next/headers', message: 'The anonymous path reads no cookie or header.' },
            { name: '@/server/getActor', message: 'The anonymous path reads no session.' },
            { name: '@/server/actionGuard', message: 'The anonymous path reads no CSRF cookie.' },
            { name: '@/server/actionRunner', message: 'The anonymous path uses no action runner.' },
          ],
          patterns: [
            { group: ['../../../*'] },
            { group: ['@/features/auth/*'], message: 'The anonymous path reads no account.' },
            { group: ['@/server/trpc/*'], message: 'The anonymous path uses no tRPC context.' },
          ],
        },
      ],
    },
  },
)
