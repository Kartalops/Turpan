/**
 * Tests for fingerprint cache.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getCachedFingerprint, cacheFingerprint, clearFingerprintCache, getFingerprintCacheStats, } from './fingerprintCache.js';
import { detectProjectAsync } from './detectProject.js';
describe('fingerprintCache', () => {
    let tmpDir;
    beforeAll(() => {
        tmpDir = join(tmpdir(), `turpan-fp-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            name: 'test-project',
            dependencies: { react: '^18.0.0' },
        }));
    });
    afterAll(() => {
        rmSync(tmpDir, { recursive: true, force: true });
        clearFingerprintCache();
    });
    it('caches and retrieves fingerprint', async () => {
        clearFingerprintCache();
        const fp = await detectProjectAsync(tmpDir);
        expect(fp.projectName).toBe('test-project');
        // The fingerprint should now be cached
        const stats = getFingerprintCacheStats();
        expect(stats.size).toBeGreaterThan(0);
        // Second call should return the same fingerprint
        const fp2 = await detectProjectAsync(tmpDir);
        expect(fp2).toBe(fp); // same reference
    });
    it('invalidates cache when package.json changes', async () => {
        clearFingerprintCache();
        const fp1 = await detectProjectAsync(tmpDir);
        expect(fp1.projectName).toBe('test-project');
        // Modify package.json
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            name: 'changed-project',
        }));
        // Wait a tick for mtime change
        await new Promise(r => setTimeout(r, 10));
        const fp2 = await detectProjectAsync(tmpDir);
        expect(fp2.projectName).toBe('changed-project');
    });
    it('returns undefined for cache miss', async () => {
        clearFingerprintCache();
        const result = await getCachedFingerprint(tmpDir);
        expect(result).toBeUndefined();
    });
    it('manually caches and retrieves fingerprint', async () => {
        clearFingerprintCache();
        const fakeFp = {
            projectRoot: tmpDir,
            projectName: 'fake',
        };
        await cacheFingerprint(tmpDir, fakeFp);
        const cached = await getCachedFingerprint(tmpDir);
        expect(cached).toBe(fakeFp);
    });
    it('clearFingerprintCache empties the cache', async () => {
        await detectProjectAsync(tmpDir);
        expect(getFingerprintCacheStats().size).toBeGreaterThan(0);
        clearFingerprintCache();
        expect(getFingerprintCacheStats().size).toBe(0);
    });
});
//# sourceMappingURL=fingerprintCache.test.js.map