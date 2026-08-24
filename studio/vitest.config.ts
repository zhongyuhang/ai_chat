import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/server/**/*.test.ts', 'tests/shared/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
