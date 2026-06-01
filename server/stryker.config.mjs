export default {
  packageManager: 'npm',
  reporters: ['json', 'progress'],
  testRunner: 'command',
  commandRunner: {
    command: 'node --test test/rooms.test.js test/handlers.test.js test/api.test.js test/sanitize.test.js test/sweep.test.js',
  },
  coverageAnalysis: 'off',
  // inPlace mutates the shared working tree, so parallel runners would race
  // while overwriting the same source files and produce unreliable results.
  concurrency: 1,
  inPlace: true,
  mutate: ['handlers.js', 'rooms.js', 'sanitize.js'],
};
