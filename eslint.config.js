// @ts-check

import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import customRules from './eslint/rules.js';

// Dump of globals that are available in the Hermes runtime, which is used by React Native.
// hermes@250829098.0.16 - React Native 0.87
const globalsHermes = [
  // ECMAScript globals newer than ES2020,
  // but available in the target Hermes runtime.
  'AggregateError',
  'WeakRef',

  // Hermes
  'HermesInternal',
  'DebuggerInternal',
  'QuitError',
  'TimeoutError',
  'gc',
  'print',

  // Intl globals exposed directly by Hermes
  'Collator',
  'DateTimeFormat',
  'NumberFormat',

  // Web / React Native globals
  'AbortController',
  'AbortSignal',
  'Blob',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'CustomEvent',
  'DOMException',
  'Event',
  'EventTarget',
  'File',
  'FileReader',
  'FormData',
  'Headers',
  'Request',
  'Response',

  // Encoding
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoder',
  'TextEncoderStream',

  // URL
  'URL',
  'URLSearchParams',

  // Streams
  'ReadableByteStreamController',
  'ReadableStream',
  'ReadableStreamBYOBReader',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController',
  'ReadableStreamDefaultReader',
  'TransformStream',
  'TransformStreamDefaultController',
  'WritableStream',
  'WritableStreamDefaultController',
  'WritableStreamDefaultWriter',

  // DOM-like APIs exposed by React Native
  'CharacterData',
  'Document',
  'Element',
  'HTMLCollection',
  'HTMLElement',
  'Node',
  'NodeList',
  'Text',
  'DOMRect',
  'DOMRectList',
  'DOMRectReadOnly',

  // Performance APIs
  'Performance',
  'PerformanceEntry',
  'PerformanceEventTiming',
  'PerformanceLongTaskTiming',
  'PerformanceMark',
  'PerformanceMeasure',
  'PerformanceObserver',
  'PerformanceObserverEntryList',
  'PerformanceResourceTiming',
  'performance',

  // Networking
  'WebSocket',
  'XMLHttpRequest',
  'fetch',

  // Encoding helpers
  'atob',
  'btoa',

  // Scheduling
  'cancelAnimationFrame',
  'cancelIdleCallback',
  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
  'setImmediate',
  'setInterval',
  'setTimeout',

  // Other runtime globals
  'alert',
  'console',
  'ErrorUtils',
  'navigator',
  'process',
  'self',
  'structuredClone',
  'window',

  // Plugin host
  'exports',
  'module',
  'require',
  '__DEV__',
].map(key => ({ [key]: 'readonly' }));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  prettierConfig,
  {
    ignores: [
      '.js',
      'public/static',
      'docs',
      'extra',
      'proxy_server.js',
      'plugins/*/*\\[*\\]*.ts', // Files with square brackets in their names
      'electron',
      'plugins/*/broken_*/**',
    ],
  },
  {
    files: ['plugins/*/*/*.ts', 'plugins/multisrc/*/template.ts'],
    plugins: {
      custom: customRules,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      'no-case-declarations': 'warn',
      'no-undef': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/fetch*'],
              message: 'Use @libs/fetch instead of @/lib/fetch',
            },
          ],
        },
      ],
      'custom/approved-imports': 'error',
      'custom/no-lnreader-incompatible-imports': 'warn',
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: Object.assign({}, ...globalsHermes),
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,js}'],
    ignores: ['plugins/*/*/*.ts', 'plugins/multisrc/*/template.ts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-undef': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/fetch*'],
              message: 'Use @libs/fetch instead of @/lib/fetch',
            },
          ],
        },
      ],
    },
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
);
