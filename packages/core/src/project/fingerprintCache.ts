/**
 * Fingerprint cache — caches the project fingerprint for a single run.
 *
 * The fingerprint is computed once per run and reused by every analyzer
 * and stage. This avoids redundant filesystem traversal when many
 * analyzers all need the same project metadata.
 */

import type { ProjectFingerprint } from './ProjectFingerprint.js';

interface CacheEntry {
  fingerprint: ProjectFingerprint;
  /** Hash of the inputs that produced this fingerprint */
  cacheKey: string;
  /** When this entry was created */
  cachedAt: string;
  /** Process ID that owns this cache */
  pid: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Compute a stable cache key for the fingerprint.
 * Includes the absolute path AND a hash of relevant metadata files
 * (package.json, turpan.yml) — so the cache invalidates when those change.
 */
export async function buildCacheKey(projectRoot: string): Promise<string> {
  const { readFileSync, existsSync, statSync } = await import('fs');
  const { join } = await import('path');
  const { createHash } = await import('crypto');

  const keyParts: string[] = [projectRoot];

  // Hash package.json / pyproject.toml / requirements.txt if they exist
  const candidates = ['package.json', 'turpan.yml', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod'];
  for (const file of candidates) {
    const p = join(projectRoot, file);
    if (existsSync(p)) {
      try {
        const stat = statSync(p);
        const content = readFileSync(p);
        const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
        keyParts.push(`${file}:${stat.mtimeMs}:${hash}`);
      } catch {
        // ignore — file became unreadable mid-flight
      }
    }
  }

  return createHash('sha256').update(keyParts.join('|')).digest('hex').slice(0, 32);
}

/**
 * Get a cached fingerprint for the given project root.
 * Returns undefined if not cached or if the cache key has changed.
 */
export async function getCachedFingerprint(projectRoot: string): Promise<ProjectFingerprint | undefined> {
  const key = await buildCacheKey(projectRoot);
  const entry = cache.get(projectRoot);
  if (!entry) return undefined;
  if (entry.cacheKey !== key) return undefined;
  if (entry.pid !== process.pid) return undefined; // different process
  return entry.fingerprint;
}

/**
 * Store a fingerprint in the cache for the given project root.
 */
export async function cacheFingerprint(projectRoot: string, fingerprint: ProjectFingerprint): Promise<void> {
  const key = await buildCacheKey(projectRoot);
  cache.set(projectRoot, {
    fingerprint,
    cacheKey: key,
    cachedAt: new Date().toISOString(),
    pid: process.pid,
  });
}

/**
 * Clear the fingerprint cache. Useful for testing.
 */
export function clearFingerprintCache(): void {
  cache.clear();
}

/**
 * Get cache statistics (for diagnostics / tests).
 */
export function getFingerprintCacheStats(): { size: number; entries: Array<{ projectRoot: string; cachedAt: string }> } {
  return {
    size: cache.size,
    entries: Array.from(cache.entries()).map(([projectRoot, entry]) => ({
      projectRoot,
      cachedAt: entry.cachedAt,
    })),
  };
}
