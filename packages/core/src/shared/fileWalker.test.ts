/**
 * Tests for the file walker with ignore support.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { walkFiles, compileGlob, DEFAULT_IGNORED_DIRS } from './fileWalker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('fileWalker', () => {
  describe('walkFiles', () => {
    let tmpDir: string;
    beforeAll(() => {
      tmpDir = join(tmpdir(), `turpan-walker-${Date.now()}`);
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      mkdirSync(join(tmpDir, 'node_modules', 'foo'), { recursive: true });
      mkdirSync(join(tmpDir, 'dist'), { recursive: true });
      mkdirSync(join(tmpDir, 'src/components'), { recursive: true });

      writeFileSync(join(tmpDir, 'src/a.ts'), '');
      writeFileSync(join(tmpDir, 'src/b.tsx'), '');
      writeFileSync(join(tmpDir, 'src/c.js'), '');
      writeFileSync(join(tmpDir, 'src/components/Dashboard.tsx'), '');
      writeFileSync(join(tmpDir, 'node_modules/foo/lib.ts'), '');
      writeFileSync(join(tmpDir, 'dist/bundle.js'), '');
    });
    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds files with given extensions', () => {
      const files = walkFiles({ cwd: tmpDir, extensions: ['ts', 'tsx'] });
      expect(files.length).toBe(3); // a.ts, b.tsx, Dashboard.tsx
      expect(files.every(f => /\.(ts|tsx)$/.test(f))).toBe(true);
    });

    it('does not descend into node_modules', () => {
      const files = walkFiles({ cwd: tmpDir, extensions: ['ts', 'tsx', 'js'] });
      expect(files.some(f => f.includes('node_modules'))).toBe(false);
    });

    it('does not descend into dist', () => {
      const files = walkFiles({ cwd: tmpDir, extensions: ['ts', 'tsx', 'js'] });
      expect(files.some(f => f.includes('dist'))).toBe(false);
    });

    it('supports custom ignoreDirs', () => {
      const files = walkFiles({
        cwd: tmpDir,
        extensions: ['ts', 'tsx'],
        ignoreDirs: new Set(['src']),
      });
      expect(files.some(f => f.includes('src'))).toBe(false);
    });

    it('respects ignoreGlobs', () => {
      const files = walkFiles({
        cwd: tmpDir,
        extensions: ['ts', 'tsx'],
        ignoreGlobs: ['**/components/**'],
      });
      expect(files.some(f => f.includes('components'))).toBe(false);
    });

    it('respects ignorePaths', () => {
      const files = walkFiles({
        cwd: tmpDir,
        extensions: ['ts', 'tsx'],
        ignorePaths: ['src/components'],
      });
      expect(files.some(f => f.includes('components'))).toBe(false);
    });

    it('does NOT include node_modules by default', () => {
      // Make sure DEFAULT_IGNORED_DIRS is set
      expect(DEFAULT_IGNORED_DIRS.has('node_modules')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('.next')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('dist')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('.turpan')).toBe(true);
      expect(DEFAULT_IGNORED_DIRS.has('build')).toBe(true);
    });
  });

  describe('compileGlob', () => {
    it('matches simple * pattern', () => {
      const match = compileGlob('*.ts');
      expect(match('foo.ts')).toBe(true);
      expect(match('foo.tsx')).toBe(false);
    });

    it('matches ** recursively', () => {
      const match = compileGlob('**/foo/**');
      expect(match('src/foo/bar.ts')).toBe(true);
      expect(match('foo/baz.ts')).toBe(true);
      expect(match('bar/baz.ts')).toBe(false);
    });

    it('matches single ? char', () => {
      const match = compileGlob('a?c.ts');
      expect(match('abc.ts')).toBe(true);
      expect(match('ac.ts')).toBe(false);
    });

    it('matches literal paths', () => {
      const match = compileGlob('src/legacy.ts');
      expect(match('src/legacy.ts')).toBe(true);
      expect(match('src/legacy2.ts')).toBe(false);
    });
  });
});
