import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Silent failures hide bugs: every catch must handle or rethrow.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Public website + admin (browser code)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      // Browser code must never reach server-only modules or secrets.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@prisma/*',
                'pg',
                '@neondatabase/*',
                '@supabase/*',
                'razorpay',
                '**/apps/api/**',
              ],
              message: 'Browser code must not import server-only packages. Call the API instead.',
            },
          ],
        },
      ],
    },
  },
  // Node code: API, scripts, tooling configs
  {
    files: [
      'apps/api/**/*.ts',
      'scripts/**/*.mjs',
      'apps/web/scripts/**/*.mjs',
      '.claude/**/*.mjs',
      '**/*.config.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/web/scripts/**/*.mjs', '.claude/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  // Tests may use non-null assertions for brevity.
  {
    files: ['**/*.test.{ts,tsx}', '**/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier,
);
