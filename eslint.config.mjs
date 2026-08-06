import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

/**
 * The one rule this repository could not survive losing.
 *
 * ADR 0001 ships two apps that share logic but not UI, and names drift as the
 * failure mode: mobile falls behind web until it stops shipping. The mitigation
 * is that `packages/` stays genuinely shared — so a platform import there is an
 * error, not a code-review conversation. Everything else here exists to make
 * that rule runnable.
 *
 * Each app keeps its own config (`apps/web/eslint.config.mjs`, `expo lint`) for
 * its own framework rules.
 */
export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/.expo/**',
    '**/dist/**',
    'apps/**',
  ]),
  {
    files: ['packages/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*'],
              message:
                'Shared packages must not import from next/* (ADR 0001). ' +
                'Keep framework code in apps/web.',
            },
            {
              group: ['expo', 'expo-*', 'expo/*'],
              message:
                'Shared packages must not import from expo-* (ADR 0001). ' +
                'Keep native code in apps/native.',
            },
            {
              group: ['react-native', 'react-native/*', 'react-native-*'],
              message:
                'Shared packages must not import from react-native (ADR 0001). ' +
                'Screens are written twice, on purpose.',
            },
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message:
                'Shared packages must not import React (ADR 0001). They share ' +
                'logic, types and tokens — not UI.',
            },
          ],
        },
      ],
    },
  },
])
