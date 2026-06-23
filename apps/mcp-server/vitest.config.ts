import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Disable code transformation — use tsx directly on source
    deps: {
      transformMode: 'hoist',
    },
  },
});