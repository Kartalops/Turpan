/**
 * File walker with ignore support.
 * Skips node_modules, dist, build, .next, .turpan by default.
 * Supports custom globs from turpan.yml `ignore.paths` / `ignore.globs`.
 */

import { readdirSync, statSync } from 'fs';
import { join, extname, basename, relative, sep } from 'path';

// Default directories and files to skip — covers the common build/cache/output
// directories that should NEVER be analyzed.
export const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.turpan',
  '.vite',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.swc',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
  '__snapshots__',
  '__mocks__',
  '.idea',
  '.vscode',
]);

export const DEFAULT_IGNORED_FILES = new Set<string>([]);

export interface WalkOptions {
  cwd: string;
  /** File extensions to include (without leading dot) */
  extensions: string[];
  /** Directory names to skip (defaults to DEFAULT_IGNORED_DIRS) */
  ignoreDirs?: Set<string>;
  /** File basenames to skip */
  ignoreFiles?: Set<string>;
  /** Glob patterns to ignore (supports simple globs: *, **, ?) */
  ignoreGlobs?: string[];
  /** Explicit paths to ignore (relative to cwd) */
  ignorePaths?: string[];
  /** Maximum recursion depth (default: 20) */
  maxDepth?: number;
  /** Follow symlinks (default: false) */
  followSymlinks?: boolean;
}

/**
 * Recursively find all files with given extensions, skipping ignored paths.
 */
export function walkFiles(options: WalkOptions): string[] {
  const {
    cwd,
    extensions,
    ignoreDirs = DEFAULT_IGNORED_DIRS,
    ignoreFiles = DEFAULT_IGNORED_FILES,
    ignoreGlobs = [],
    ignorePaths = [],
    maxDepth = 20,
    followSymlinks = false,
  } = options;
  const results: string[] = [];
  const extSet = new Set(extensions);

  const compiledIgnoreGlobs = ignoreGlobs.map(compileGlob);

  function isIgnored(absPath: string): boolean {
    const base = basename(absPath);
    if (ignoreFiles.has(base)) return true;

    const rel = relative(cwd, absPath);
    if (rel.startsWith('..')) return true; // outside cwd

    for (const igPath of ignorePaths) {
      if (rel === igPath || rel.startsWith(igPath + sep)) return true;
    }

    for (const match of compiledIgnoreGlobs) {
      if (match(rel)) return true;
    }

    return false;
  }

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (ignoreDirs.has(entry)) continue;
        if (isIgnored(fullPath)) continue;
        walk(fullPath, depth + 1);
      } else if (stat.isFile() || (followSymlinks && stat.isSymbolicLink())) {
        if (isIgnored(fullPath)) continue;
        const ext = extname(entry).replace('.', '');
        if (extSet.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(cwd, 0);
  return results;
}

/**
 * Compile a simple glob pattern into a predicate function.
 * Supported patterns:
 *   `*`         — match any chars except `/`
 *   `**`        — match any chars including `/`
 *   `?`         — match a single char
 *   literal     — exact match
 * Patterns are matched against the path relative to cwd, normalized to use `/`.
 */
export function compileGlob(pattern: string): (path: string) => boolean {
  const normalized = pattern.replace(/\\/g, '/');
  // Convert each segment to a regex, then join with `/`
  const parts = normalized.split('/').map(part => {
    let re = '';
    for (let i = 0; i < part.length; i++) {
      const c = part[i];
      if (c === '*') {
        if (part[i + 1] === '*') {
          // `**` — match any chars including `/` (and zero chars)
          re += '.*';
          i++;
        } else {
          // `*` — match any chars except `/`
          re += '[^/]*';
        }
      } else if (c === '?') {
        re += '[^/]';
      } else if ('.+^$()|{}[]\\'.includes(c)) {
        re += '\\' + c;
      } else {
        re += c;
      }
    }
    return re;
  });

  // Join with separator. `**` next to `/` may collapse to `(?:.*/)?` so it can
  // match zero segments. Replace any `(?:.*/)?.*` pattern with `.*`.
  let joined = parts.join('/');
  // Make `/**` collapse (zero or more trailing segments)
  joined = joined.replace(/\/\.\*$/, '(?:/.*)?');
  // Make `**/` at start optional (zero or more leading segments)
  if (joined.startsWith('.*/')) {
    joined = '(?:.*/)?' + joined.slice(3);
  }
  const fullRe = '^' + joined + '$';
  const re = new RegExp(fullRe);

  return (path: string) => {
    const normalizedPath = path.replace(/\\/g, '/');
    // Match the full path exactly
    if (re.test(normalizedPath)) return true;
    // Also try matching any subpath so patterns like `**/foo` match `a/b/foo`
    const segments = normalizedPath.split('/');
    let acc = '';
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      if (re.test(acc)) return true;
    }
    return false;
  };
}

/**
 * Combine default ignore sets with config-supplied ignores.
 * Useful for the CLI entry point.
 */
export function buildIgnoreSet(config: {
  ignoreDirs?: string[];
  ignoreFiles?: string[];
}): { dirs: Set<string>; files: Set<string> } {
  return {
    dirs: new Set([...DEFAULT_IGNORED_DIRS, ...(config.ignoreDirs ?? [])]),
    files: new Set([...DEFAULT_IGNORED_FILES, ...(config.ignoreFiles ?? [])]),
  };
}
