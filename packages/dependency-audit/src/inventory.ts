/**
 * DependencyInventory — parses package.json, lockfiles, requirements.txt
 * to produce a unified DependencyInventory.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type {
  DependencyEntry,
  DependencyInventory,
  DependencyType,
  DependencySource,
} from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function semverToRange(version: string): string {
  // Normalize: ^1.2.3 → >=1.2.3 <2.0.0, ~1.2.3 → >=1.2.3 <1.3.0
  if (version.startsWith('^')) return `>=${version.slice(1)} <${bumpMajor(version.slice(1))}`;
  if (version.startsWith('~')) return `>=${version.slice(1)} <${bumpMinor(version.slice(1))}`;
  if (version.startsWith('>=')) return version;
  return `=${version}`;
}

function bumpMajor(v: string): string {
  const [maj] = v.split('.').map(Number);
  return `${(maj ?? 0) + 1}.0.0`;
}
function bumpMinor(v: string): string {
  const [maj, min] = v.split('.').map(Number);
  return `${maj ?? 0}.${(min ?? 0) + 1}.0`;
}

// ─── Node.js inventory ────────────────────────────────────────────────────────

interface NpmPackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[];
}

function parsePackageJson(path: string): NpmPackageJson | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as NpmPackageJson;
  } catch {
    return null;
  }
}

function readLockfile(path: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readYamlLock(path: string): string[] | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    // Minimal YAML parser for pnpm-lock.yaml
    const lines = raw.split('\n');
    const deps: string[] = [];
    let inDeps = false;
    for (const line of lines) {
      if (line.startsWith('  dependencies:') || line.startsWith('devDependencies:')) {
        inDeps = true;
        continue;
      }
      if (inDeps && line.match(/^\S/)) break; // next top-level key
      if (inDeps && line.match(/^\s{4}/)) {
        // "  foo@^1.0.0:" — extract "foo@^1.0.0"
        const m = line.trim().match(/^([^:]+):/);
        if (m) deps.push(m[1]);
      }
    }
    return deps;
  } catch {
    return null;
  }
}

interface ParsedLockDep {
  version: string;
  resolved?: string;
  license?: string;
  dependencies?: Record<string, string>;
}

/**
 * Parse pnpm-lock.yaml (YAML format) for Node projects.
 * Returns a map of "name@version" → { version, resolved, license, dependencies }
 */
function parsePnpmLock(path: string): Map<string, ParsedLockDep> {
  const raw = readFileSync(path, 'utf-8');
  const result = new Map<string, ParsedLockDep>();

  // pnpm-lock v6+ format: each dependency is a key like "pkg@version"
  // with indented sub-keys
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^  "([^@]+)@(.+)":$/);
    if (match) {
      const name = match[1];
      const version = match[2];
      const key = `${name}@${version}`;
      const dep: ParsedLockDep = { version };
      i++;
      while (i < lines.length && lines[i].match(/^\s{4}/)) {
        const sub = lines[i].match(/^\s{4}(\w+):\s*(.+)/);
        if (sub) {
          if (sub[1] === 'resolved') dep.resolved = sub[2].replace(/'/g, '').replace(/\\/g, '');
          else if (sub[1] === 'license') dep.license = sub[2].replace(/'/g, '').replace(/\\/g, '');
        }
        i++;
      }
      result.set(key, dep);
    } else {
      i++;
    }
  }
  return result;
}

/**
 * Parse package-lock.json (npm v2/v3/v4 format)
 */
function parsePackageLock(path: string): Map<string, ParsedLockDep> {
  const lock = readLockfile(path) as { dependencies?: Record<string, { version: string; resolved?: string; license?: string; dependencies?: Record<string, string> }> } | null;
  const result = new Map<string, ParsedLockDep>();
  if (!lock?.dependencies) return result;

  function walk(
    name: string,
    entry: { version: string; resolved?: string; license?: string; dependencies?: Record<string, string> }
  ): void {
    const key = `${name}@${entry.version}`;
    result.set(key, {
      version: entry.version,
      resolved: entry.resolved,
      license: entry.license,
    });
    if (entry.dependencies) {
      for (const [dep, sub] of Object.entries(entry.dependencies)) {
        walk(dep, sub as unknown as { version: string; resolved?: string; license?: string });
      }
    }
  }

  for (const [name, entry] of Object.entries(lock.dependencies)) {
    walk(name, entry as unknown as { version: string; resolved?: string; license?: string; dependencies?: Record<string, string> });
  }
  return result;
}

function detectNodeProjectType(projectPath: string): 'node' | 'unknown' {
  if (existsSync(join(projectPath, 'package.json'))) return 'node';
  return 'unknown';
}

function makeEntry(
  name: string,
  version: string,
  type: DependencyType,
  source: DependencySource,
  lockDeps: Map<string, ParsedLockDep>,
  parent?: string,
  sourceFile?: string,
): DependencyEntry {
  const key = `${name}@${version}`;
  const lockEntry = lockDeps.get(key);
  return {
    name,
    version,
    type,
    source,
    parent,
    resolvedVersion: lockEntry?.version !== version ? lockEntry?.version : undefined,
    license: lockEntry?.license,
    sourceFile,
  };
}

/**
 * Build DependencyInventory for a Node.js project.
 */
export function buildNodeInventory(projectPath: string): DependencyInventory {
  const pkg = parsePackageJson(join(projectPath, 'package.json'));
  const entries: DependencyEntry[] = [];

  // Detect lockfile type
  const pnpmLock = join(projectPath, 'pnpm-lock.yaml');
  const npmLock = join(projectPath, 'package-lock.json');
  const yarnLock = join(projectPath, 'yarn.lock');

  let lockDeps = new Map<string, ParsedLockDep>();
  let lockfileType: 'pnpm' | 'npm' | 'yarn' | 'none' = 'none';
  if (existsSync(pnpmLock)) {
    lockDeps = parsePnpmLock(pnpmLock);
    lockfileType = 'pnpm';
  } else if (existsSync(npmLock)) {
    lockDeps = parsePackageLock(npmLock);
    lockfileType = 'npm';
  } else if (existsSync(yarnLock)) {
    // yarn.lock — use package.json versions only (yarn doesn't have a JSON lockfile)
    lockfileType = 'yarn';
  }

  function addDeps(
    deps: Record<string, string> | undefined,
    type: DependencyType,
    source: DependencySource,
    parent?: string,
    sourceFile?: string,
  ): void {
    if (!deps) return;
    for (const [name, version] of Object.entries(deps)) {
      entries.push(makeEntry(name, version, type, source, lockDeps, parent, sourceFile));
    }
  }

  if (pkg) {
    const pkgFile = join(projectPath, 'package.json');
    addDeps(pkg.dependencies, 'prod', 'direct', undefined, pkgFile);
    addDeps(pkg.devDependencies, 'dev', 'direct', undefined, pkgFile);
    addDeps(pkg.peerDependencies, 'peer', 'direct', undefined, pkgFile);
    addDeps(pkg.optionalDependencies, 'optional', 'direct', undefined, pkgFile);

    // Transitive deps from lockfile
    if (lockDeps.size > 0) {
      const seen = new Set(entries.map(e => `${e.name}@${e.version}`));
      const lockFile = pnpmLock !== 'none' && existsSync(pnpmLock)
        ? pnpmLock
        : existsSync(npmLock) ? npmLock : undefined;
      // Walk lock deps to find transitive
      for (const [key, lockEntry] of lockDeps.entries()) {
        if (!seen.has(key)) {
          const [name, version] = key.split('@');
          // If this dep isn't in package.json directly, it's transitive
          entries.push({
            name,
            version,
            type: 'prod',
            source: 'transitive',
            resolvedVersion: lockEntry.resolved,
            license: lockEntry.license,
            sourceFile: lockFile,
          });
          seen.add(key);
        }
      }
    }
  }

  return {
    projectPath,
    projectType: 'node',
    projectName: pkg?.name,
    projectVersion: pkg?.version,
    dependencies: entries,
    timestamp: new Date().toISOString(),
  };
}

// ─── Python inventory ─────────────────────────────────────────────────────────

function parseRequirementsTxt(path: string): { name: string; version: string }[] {
  const deps: { name: string; version: string }[] = [];
  try {
    const raw = readFileSync(path, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // "package>=1.0.0" or "package==1.2.3" or "package" or "package@ git+..."
      const m = trimmed.match(/^([a-zA-Z0-9_\-\.]+)([=<>!@].*)?$/);
      if (m) {
        deps.push({ name: m[1].toLowerCase(), version: m[2] ?? '*' });
      }
    }
  } catch {
    // ignore
  }
  return deps;
}

function parsePyprojectToml(path: string): { name?: string; version?: string; deps: Record<string, string> } {
  try {
    const raw = readFileSync(path, 'utf-8');
    const nameMatch = raw.match(/^\[project\]\s*\n\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = raw.match(/^\[project\]\s*\n\s*version\s*=\s*"([^"]+)"/m);
    const deps: Record<string, string> = {};
    // Find dependencies table [project.dependencies]
    const depBlock = raw.match(/^\[project\.dependencies\]\s*\n((?:\s+".+"\n?)+)/m);
    if (depBlock) {
      for (const line of depBlock[1].split('\n')) {
        const m = line.trim().match(/^([a-zA-Z0-9_\-\.]+)([=<>!@].*)?/);
        if (m) deps[m[1].toLowerCase()] = m[2] ?? '*';
      }
    }
    return {
      name: nameMatch?.[1],
      version: versionMatch?.[1],
      deps,
    };
  } catch {
    return { deps: {} };
  }
}

export function buildPythonInventory(projectPath: string): DependencyInventory {
  const reqTxt = join(projectPath, 'requirements.txt');
  const pyproject = join(projectPath, 'pyproject.toml');
  const uvLock = join(projectPath, 'uv.lock');
  const poetryLock = join(projectPath, 'poetry.lock');

  const entries: DependencyEntry[] = [];

  const reqDeps = existsSync(reqTxt) ? parseRequirementsTxt(reqTxt) : [];
  for (const { name, version } of reqDeps) {
    entries.push({ name, version, type: 'prod', source: 'direct' });
  }

  if (existsSync(pyproject)) {
    const py = parsePyprojectToml(pyproject);
    for (const [name, version] of Object.entries(py.deps)) {
      if (!entries.find(e => e.name === name)) {
        entries.push({ name, version, type: 'prod', source: 'direct' });
      }
    }
    return {
      projectPath,
      projectType: 'python',
      projectName: py.name,
      projectVersion: py.version,
      dependencies: entries,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    projectPath,
    projectType: 'python',
    dependencies: entries,
    timestamp: new Date().toISOString(),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Auto-detect project type and build the dependency inventory.
 */
export function buildDependencyInventory(projectPath: string): DependencyInventory {
  if (detectNodeProjectType(projectPath) === 'node') {
    return buildNodeInventory(projectPath);
  }
  if (existsSync(join(projectPath, 'requirements.txt')) || existsSync(join(projectPath, 'pyproject.toml'))) {
    return buildPythonInventory(projectPath);
  }
  return {
    projectPath,
    projectType: 'unknown',
    dependencies: [],
    timestamp: new Date().toISOString(),
  };
}
