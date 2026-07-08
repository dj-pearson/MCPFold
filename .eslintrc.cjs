/**
 * Root ESLint config (ESLint 8, .eslintrc format).
 *
 * The critical rule for this project lives in the `packages/core` override:
 * core must stay pure and I/O-free (no node:fs / node:os / network libs).
 * All I/O flows through injected ClientAdapter / SecretProvider implementations.
 */
const FORBIDDEN_IN_CORE = [
  { name: 'fs', message: 'core must be I/O-free — inject a ClientAdapter/SecretProvider instead.' },
  {
    name: 'node:fs',
    message: 'core must be I/O-free — inject a ClientAdapter/SecretProvider instead.',
  },
  {
    name: 'fs/promises',
    message: 'core must be I/O-free — inject a ClientAdapter/SecretProvider instead.',
  },
  {
    name: 'node:fs/promises',
    message: 'core must be I/O-free — inject a ClientAdapter/SecretProvider instead.',
  },
  { name: 'os', message: 'core must not read the environment — pass values in via adapters.' },
  { name: 'node:os', message: 'core must not read the environment — pass values in via adapters.' },
  { name: 'path', message: 'core must not resolve real paths — adapters own path resolution.' },
  {
    name: 'node:path',
    message: 'core must not resolve real paths — adapters own path resolution.',
  },
  { name: 'net', message: 'core must be network-free.' },
  { name: 'node:net', message: 'core must be network-free.' },
  { name: 'http', message: 'core must be network-free.' },
  { name: 'node:http', message: 'core must be network-free.' },
  { name: 'https', message: 'core must be network-free.' },
  { name: 'node:https', message: 'core must be network-free.' },
  { name: 'child_process', message: 'core must not spawn processes.' },
  { name: 'node:child_process', message: 'core must not spawn processes.' },
  { name: 'execa', message: 'core must not spawn processes.' },
  { name: 'undici', message: 'core must be network-free.' },
  { name: 'node-fetch', message: 'core must be network-free.' },
];

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: [
    'dist/',
    'build/',
    'coverage/',
    'node_modules/',
    '**/*.d.ts',
    '**/fixtures/**',
    'services/edge/', // Deno service — linted/formatted by `deno lint` / `deno fmt`
    'apps/web/', // React app — typechecked by its own tsc; not covered by the core eslint config
    'apps/site/', // marketing site — typechecked by its own tsc; not covered by the core eslint config
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['packages/core/**/*.ts'],
      excludedFiles: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'no-restricted-imports': ['error', { paths: FORBIDDEN_IN_CORE }],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      env: { node: true },
    },
  ],
};
