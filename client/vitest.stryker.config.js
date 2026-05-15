import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Stryker-specific config: jsdom instead of real browser so Stryker can run
// many test iterations without spinning up Chromium each time.
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  optimizeDeps: {
    noDiscovery: true,
  },
  test: {
    globals: true,
    setupFiles: ['src/test/setup.js'],
    environment: 'jsdom',
  },
});
