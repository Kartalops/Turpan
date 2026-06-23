import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveProjectPath, fileExists, readJsonFile, listDirectory, createTimestampDir, } from './index.js';
import { isGitRepository, getGitInfo, } from '../git/index.js';
describe('shared/fs', () => {
    describe('resolveProjectPath', () => {
        it('returns cwd for undefined input', () => {
            // CWD in vitest should be project root
            const result = resolveProjectPath();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });
        it('returns absolute path unchanged', () => {
            const abs = '/tmp/abc';
            expect(resolveProjectPath(abs)).toBe(abs);
        });
        it('resolves relative paths', () => {
            expect(resolveProjectPath('foo')).toContain('foo');
        });
    });
    describe('fileExists', () => {
        it('returns true for existing file', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
            const f = join(tmp, 'a.txt');
            writeFileSync(f, 'hi');
            expect(fileExists(f)).toBe(true);
            rmSync(tmp, { recursive: true, force: true });
        });
        it('returns false for missing file', () => {
            expect(fileExists('/definitely/not/here/12345.txt')).toBe(false);
        });
    });
    describe('readJsonFile', () => {
        it('parses valid JSON', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
            const f = join(tmp, 'a.json');
            writeFileSync(f, JSON.stringify({ a: 1, b: 'x' }));
            expect(readJsonFile(f)).toEqual({ a: 1, b: 'x' });
            rmSync(tmp, { recursive: true, force: true });
        });
        it('returns null for invalid JSON', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
            const f = join(tmp, 'a.json');
            writeFileSync(f, '{not json');
            expect(readJsonFile(f)).toBeNull();
            rmSync(tmp, { recursive: true, force: true });
        });
        it('returns null for missing file', () => {
            expect(readJsonFile('/definitely/not/here/12345.json')).toBeNull();
        });
    });
    describe('listDirectory', () => {
        it('lists entries in a directory', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
            writeFileSync(join(tmp, 'a.txt'), '');
            writeFileSync(join(tmp, 'b.txt'), '');
            const entries = listDirectory(tmp);
            expect(entries.length).toBe(2);
            rmSync(tmp, { recursive: true, force: true });
        });
        it('returns empty array for missing dir', () => {
            expect(listDirectory('/definitely/not/here/12345')).toEqual([]);
        });
    });
});
describe('shared/git', () => {
    it('isGitRepository returns boolean', () => {
        // Cwd may or may not be a git repo — just check it returns a boolean
        const result = isGitRepository(process.cwd());
        expect(typeof result).toBe('boolean');
    });
    it('getGitInfo returns null for non-git dirs', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
        const info = getGitInfo(tmp);
        expect(info).toBeNull();
        rmSync(tmp, { recursive: true, force: true });
    });
});
describe('shared/process', () => {
    describe('createTimestampDir', () => {
        it('creates a timestamped directory under base', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
            const dir = createTimestampDir(tmp);
            expect(existsSync(dir)).toBe(true);
            expect(dir.startsWith(tmp)).toBe(true);
            rmSync(tmp, { recursive: true, force: true });
        });
        it('creates base dir if it does not exist', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'turpan-shared-'));
            const base = join(tmp, 'nested');
            expect(existsSync(base)).toBe(false);
            const dir = createTimestampDir(base);
            expect(existsSync(dir)).toBe(true);
            rmSync(tmp, { recursive: true, force: true });
        });
    });
});
//# sourceMappingURL=fs.test.js.map