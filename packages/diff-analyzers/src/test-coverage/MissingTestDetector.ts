/**
 * MissingTestDetector — source files changed but no related tests
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext } from '../types.js';
import type { TestCoverageFinding } from './types.js';

const SOURCE_DIRS = ['src/', 'lib/', 'app/'];
const TEST_DIRS = ['test/', 'tests/', '__tests__/', '__spec__/'];

const SKIP_EXTENSIONS = ['.d.ts', '.types.ts', '.type.ts'];
const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

function shouldSkipFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (SKIP_PATHS.some((skip) => lower.includes(skip))) return true;
  return false;
}

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    TEST_DIRS.some((dir) => lower.includes(dir)) ||
    /\.test\./.test(lower) ||
    /\.spec\./.test(lower)
  );
}

function getTestFileCandidates(sourcePath: string): string[] {
  // Given a source file path, generate possible test file paths
  const candidates: string[] = [];

  // Remove extension
  const withoutExt = sourcePath.replace(/\.[^.]+$/, '');

  // Get directory and basename
  const lastSlash = withoutExt.lastIndexOf('/');
  const dir = lastSlash >= 0 ? withoutExt.slice(0, lastSlash + 1) : '';
  const basename = withoutExt.slice(lastSlash + 1);

  // Common test file naming patterns
  const testSuffixes = ['.test', '.spec', '.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx'];
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  for (const suffix of testSuffixes) {
    for (const ext of extensions) {
      candidates.push(`${dir}${basename}${suffix}${ext}`);
    }
  }

  // Also check in test/ directory parallel structure
  for (const suffix of testSuffixes) {
    for (const ext of extensions) {
      candidates.push(`test/${basename}${suffix}${ext}`);
      candidates.push(`tests/${basename}${suffix}${ext}`);
      candidates.push(`__tests__/${basename}${suffix}${ext}`);
    }
  }

  return candidates;
}

function getBasename(path: string): string {
  return path.split('/').pop() ?? path;
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = getBasename(filePath);
  return `${analyzerId}-${base}-${idx}`;
}

export const MissingTestDetector: DiffScopedAnalyzer = {
  id: 'missing-test',
  name: 'Missing Test Detector',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: TestCoverageFinding[] }> {
    const findings: TestCoverageFinding[] = [];

    // Get changed source files (not test files)
    const sourceFiles = ctx.diffResult.files.filter(
      (f) =>
        !f.binary &&
        !shouldSkipFile(f.path) &&
        !isTestFile(f.path) &&
        SOURCE_DIRS.some((dir) => f.path.includes(dir))
    );

    // If few changes and all are config/docs/infra, skip
    if (sourceFiles.length > 0 && sourceFiles.length < 3) {
      const allInfra = sourceFiles.every((f) => {
        const path = f.path.toLowerCase();
        return (
          path.includes('config') ||
          path.includes('constants') ||
          path.includes('.env') ||
          path.includes('types') ||
          path.includes('index')
        );
      });
      if (allInfra) {
        return { findings };
      }
    }

    // Get all changed test files
    const changedTestFiles = new Set(
      ctx.diffResult.files
        .filter((f) => !f.binary && isTestFile(f.path))
        .map((f) => {
          // Get basename without test suffix
          const basename = getBasename(f.path);
          return basename.replace(/\.(test|spec)\.[^.]+$/, '').replace(/\.(test|spec)$/, '');
        })
    );

    for (const sourceFile of sourceFiles) {
      const sourceBasename = getBasename(sourceFile.path).replace(/\.[^.]+$/, '');

      // Check if this source file's basename matches any changed test file
      const hasTest = changedTestFiles.has(sourceBasename);

      if (!hasTest) {
        // Determine if this is infrastructure or feature code
        const path = sourceFile.path.toLowerCase();
        const isInfrastructure =
          path.includes('/types') ||
          path.includes('/constants') ||
          path.includes('/config') ||
          path.includes('/index.ts') ||
          path.includes('.d.ts');

        findings.push({
          id: generateId('missing-test', sourceFile.path, 1),
          severity: isInfrastructure ? 'low' : 'medium',
          category: 'test-coverage',
          title: isInfrastructure
            ? `Infrastructure file changed without corresponding test`
            : `Source file changed without corresponding test`,
          explanation: `The source file "${sourceFile.path}" was ${sourceFile.changeType} but no related test file was found or modified. Consider adding a test to verify this code's behavior.`,
          file: sourceFile.path,
          introducedBy: sourceFile.changeType as TestCoverageFinding['introducedBy'],
          pattern: 'missing-test',
          confidence: 75,
          coverageType: 'missing-test',
        });
      }
    }

    return { findings };
  },
};