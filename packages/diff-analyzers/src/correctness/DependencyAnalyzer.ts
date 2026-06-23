/**
 * DependencyAnalyzer — detect package dependency changes without lockfile update
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';

const LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'bun.lockb',
  'bun.lock',
];

function isRootPackageJson(path: string): boolean {
  // Only check top-level package.json, not packages/*/package.json in monorepos
  const parts = path.split('/');
  // If it has packages/*/ in the path, it's not the root
  if (parts.includes('packages')) return false;
  return path.endsWith('package.json');
}

function isLockfile(path: string): boolean {
  const fileName = path.split('/').pop() ?? '';
  return LOCKFILES.includes(fileName);
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const DependencyAnalyzer: DiffScopedAnalyzer = {
  id: 'dependency',
  name: 'Dependency Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    // Find changed package.json at root
    const packageJsonChanged = ctx.diffResult.files.find(
      (f) => !f.binary && isRootPackageJson(f.path)
    );

    if (!packageJsonChanged) {
      return { findings };
    }

    const changeType = packageJsonChanged.changeType as DiffScopedFinding['introducedBy'];

    // Check if any lockfile was also changed
    const lockfileChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isLockfile(f.path)
    );

    if (!lockfileChanged) {
      findings.push({
        id: generateId('dependency', 'package.json', 1),
        severity: 'medium',
        category: 'correctness',
        title: `package.json changed without lockfile update`,
        explanation: `The root package.json was ${changeType} but no lockfile (pnpm-lock.yaml, yarn.lock, or package-lock.json) was updated. Run the appropriate package manager install command to update the lockfile.`,
        file: packageJsonChanged.path,
        introducedBy: changeType,
        pattern: 'dependency-change',
        confidence: 90,
      });
    }

    return { findings };
  },
};