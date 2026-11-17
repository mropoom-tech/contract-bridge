import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests do not boot the Cloudflare runtime plugin.
export default defineConfig({
  test: {
    include: ['worker/**/*.test.ts', 'src/**/*.test.{ts,tsx}', 'test-node/**/*.test.ts'],
  },
});
