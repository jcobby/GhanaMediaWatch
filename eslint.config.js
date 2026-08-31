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
  {
    // Build scripts are CommonJS running under Node, not app code bundled for
    // a device. They need Node's globals, and printing progress is the whole
    // point of them rather than a leftover debug statement.
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { __dirname: 'readonly', require: 'readonly', module: 'writable', process: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
]);
