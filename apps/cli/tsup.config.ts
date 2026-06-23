import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  treeshake: true,
  splitting: false,
  dts: true,
  // Keep all @turpan packages external - they're resolved via pnpm workspace
  rollupOptions: {
    external: [
      '@turpan/core', '@turpan/shared', '@turpan/ui-runner', '@turpan/analyzers',
      '@turpan/fix-engine', '@turpan/dependency-audit', '@turpan/git-diff', '@turpan/report',
      'playwright', 'playwright-core',
    ],
  },
});