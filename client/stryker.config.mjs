/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.stryker.config.js',
  },
  mutate: [
    'src/lib/Card.svelte',
    'src/lib/JoinForm.svelte',
  ],
  coverageAnalysis: 'perTest',
  concurrency: 1,
  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  timeoutMS: 15000,
};
