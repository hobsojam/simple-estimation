import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [svelte()],
  test: {
    globals: true,
    setupFiles: ['src/test/setup.js'],
    browser: {
      enabled: true,
      provider: playwright({ headless: true }),
      instances: [{ browser: 'chromium' }],
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
