import { defineConfig } from 'vitest/config';

// Requires a running dev server (`npm run dev`) with local D1 migrations applied.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
