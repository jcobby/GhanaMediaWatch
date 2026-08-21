const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', 'node_modules/*', 'expo-env.d.ts'],
  },
  {
    // eslint-config-expo scopes the @typescript-eslint plugin to TS files only,
    // so rules from that namespace must be scoped the same way or ESLint cannot
    // resolve the plugin when linting plain .js config files.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // The brief forbids `any`. Escape hatches must be justified in a comment.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
