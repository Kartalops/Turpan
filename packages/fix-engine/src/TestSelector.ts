import { existsSync, readdirSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import type { PatchCandidate, ReproductionCheck, SelectedTest } from './autofixTypes.js';

export function selectImpactedTests(
  projectRoot: string,
  candidate: PatchCandidate,
  reproductions: ReproductionCheck[] = [],
): SelectedTest[] {
  const tests: SelectedTest[] = [];
  const firstFile = candidate.changeSummary.filesChanged[0];
  const packageRoot = firstFile ? nearestPackageRoot(projectRoot, firstFile) : projectRoot;

  if (firstFile?.endsWith('.ts') || firstFile?.endsWith('.tsx')) {
    tests.push({
      id: 'syntax:tsc-no-emit',
      command: `tsc --noEmit --pretty false`,
      reason: 'TypeScript patch needs parser/type syntax validation',
      ladderStep: 'syntax',
    });
  }

  if (existsSync(join(packageRoot, 'tsconfig.json'))) {
    tests.push({
      id: 'typecheck:package',
      command: `tsc -p ${packageRoot} --noEmit`,
      reason: 'Relevant package has tsconfig',
      ladderStep: 'typecheck',
    });
  }

  for (const file of candidate.changeSummary.filesChanged) {
    const testPath = findSiblingTest(projectRoot, file);
    if (testPath) {
      tests.push({
        id: `unit:${testPath}`,
        command: `vitest run ${testPath}`,
        reason: `Sibling test for ${file}`,
        ladderStep: 'targeted-unit',
      });
    }
  }

  for (const reproduction of reproductions) {
    tests.push({
      id: `reproduction:${reproduction.id}`,
      command: reproduction.command,
      reason: 'Dynamic bug reproduction must flip',
      ladderStep: 'reproduction',
    });
  }

  return dedupeTests(tests);
}

function nearestPackageRoot(projectRoot: string, file: string): string {
  const parts = file.split('/');
  if (parts[0] === 'packages' && parts[1]) return join(projectRoot, parts[0], parts[1]);
  if (parts[0] === 'apps' && parts[1]) return join(projectRoot, parts[0], parts[1]);
  return projectRoot;
}

function findSiblingTest(projectRoot: string, file: string): string | undefined {
  const absoluteDir = join(projectRoot, dirname(file));
  if (!existsSync(absoluteDir)) return undefined;

  const stem = basename(file, extname(file));
  const candidates = readdirSync(absoluteDir).filter((entry) =>
    entry === `${stem}.test.ts` ||
    entry === `${stem}.test.tsx` ||
    entry === `${stem}.spec.ts` ||
    entry === `${stem}.spec.tsx`
  );

  return candidates[0] ? join(dirname(file), candidates[0]) : undefined;
}

function dedupeTests(tests: SelectedTest[]): SelectedTest[] {
  const seen = new Set<string>();
  return tests.filter((test) => {
    const key = `${test.ladderStep}:${test.command}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
