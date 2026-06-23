import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  external: [
    '@modelcontextprotocol/sdk',
    '@turpan/core',
    '@turpan/shared',
    '@turpan/fix-engine',
    '@turpan/analyzers',
    '@turpan/report',
    '@turpan/ui-runner',
  ],
  noExternal: [],
});