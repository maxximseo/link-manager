const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    ignores: [
      'node_modules/**',
      'backend/build/**',
      'coverage/**',
      '*.min.js'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    },
    plugins: {
      prettier: prettier
    },
    rules: {
      // Ловит мёртвый код
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],

      // Ловит async без await (частый баг)
      'require-await': 'warn',

      // Напоминает убрать console.log (warn, не error)
      'no-console': ['warn', {
        allow: ['warn', 'error', 'info']
      }],

      // Предотвращает забытые return в async
      'no-return-await': 'warn',

      // Предпочитать const где можно
      'prefer-const': 'warn',

      // Не использовать var
      'no-var': 'error',

      // Использовать === вместо ==
      'eqeqeq': ['warn', 'smart'],

      // Нет пустых блоков catch
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // Prettier обрабатывает форматирование
      'prettier/prettier': ['warn', {}, { usePrettierrc: true }]
    }
  }
];
