import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.js'],
    // generator.baseline.test.js averages generateScheduleBest (20 attempts) over 5 seeds x 3
    // fixtures = 300 generations, ~35s, and it does that work in a beforeAll hook. Vitest's
    // defaults (5s test / 10s hook) are both far too short for that, and the hook limit in
    // particular fails as a confusing "1 skipped" rather than a timeout on the test itself.
    // Set here rather than passed as CLI flags so a plain `npm test` behaves correctly.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
