const globals = require('globals');

module.exports = [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // Allow console in scripts and tests
  {
    files: ['scripts/**/*.js', 'tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    rules: {
      'no-console': 'off',
    },
  },
];

