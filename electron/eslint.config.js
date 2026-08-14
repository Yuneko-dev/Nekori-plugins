import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      // TypeScript already reports undefined identifiers, and this config has
      // no `globals` declared, so the core rule only produces false positives
      // for `console`, `process`, `window`, Electron types and friends.
      'no-undef': 'off',
    },
  },
  { ignores: ['dist/**', 'dist-electron/**', 'node_modules/**'] },
);
