import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
