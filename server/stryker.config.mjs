export default {
  packageManager: 'npm',
  reporters: ['json', 'progress'],
  testRunner: 'command',
  commandRunner: {
    command: 'node --test test/rooms.test.js test/handlers.test.js test/api.test.js test/sanitize.test.js test/sweep.test.js',
  },
  coverageAnalysis: 'off',
  inPlace: true,
  mutate: ['handlers.js', 'rooms.js', 'sanitize.js'],
};
