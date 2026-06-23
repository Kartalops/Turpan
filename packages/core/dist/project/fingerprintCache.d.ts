/**
 * Fingerprint cache — caches the project fingerprint for a single run.
 *
 * The fingerprint is computed once per run and reused by every analyzer
 * and stage. This avoids redundant filesystem traversal when many
 * analyzers all need the same project metadata.
 */
import type { ProjectFingerprint } from './ProjectFingerprint.js';
/**
 * Compute a stable cache key for the fingerprint.
 * Includes the absolute path AND a hash of relevant metadata files
 * (package.json, turpan.yml) — so the cache invalidates when those change.
 */
export declare function buildCacheKey(projectRoot: string): Promise<string>;
/**
 * Get a cached fingerprint for the given project root.
 * Returns undefined if not cached or if the cache key has changed.
 */
export declare function getCachedFingerprint(projectRoot: string): Promise<ProjectFingerprint | undefined>;
/**
 * Store a fingerprint in the cache for the given project root.
 */
export declare function cacheFingerprint(projectRoot: string, fingerprint: ProjectFingerprint): Promise<void>;
/**
 * Clear the fingerprint cache. Useful for testing.
 */
export declare function clearFingerprintCache(): void;
/**
 * Get cache statistics (for diagnostics / tests).
 */
export declare function getFingerprintCacheStats(): {
    size: number;
    entries: Array<{
        projectRoot: string;
        cachedAt: string;
    }>;
};
//# sourceMappingURL=fingerprintCache.d.ts.map