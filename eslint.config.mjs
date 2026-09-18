import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, globals: globals.node },
    plugins: { '@typescript-eslint': tseslint },
    rules: { ...tseslint.configs.recommended.rules, '@typescript-eslint/no-explicit-any': 'off' }
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }, globals: globals.browser },
    plugins: { '@typescript-eslint': tseslint, react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: { ...tseslint.configs.recommended.rules, ...react.configs.recommended.rules, ...reactHooks.configs.recommended.rules, 'react/react-in-jsx-scope': 'off', '@typescript-eslint/no-explicit-any': 'off' }
  },
  {
    files: ['apps/server/test/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } }
  }
];
