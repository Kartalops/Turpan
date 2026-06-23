/**
 * TestDeletionAnalyzer — test files deleted
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext } from '../types.js';
import type { TestCoverageFinding } from './types.js';

const TEST_DIRS = ['test/', 'tests/', '__tests__/', '__spec__/'];

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    TEST_DIRS.some((dir) => lower.includes(dir)) ||
    /\.test\./.test(lower) ||
    /\.spec\./.test(lower)
  );
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const TestDeletionAnalyzer: DiffScopedAnalyzer = {
  id: 'test-deletion',
  name: 'Test Deletion Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: TestCoverageFinding[] }> {
    const findings: TestCoverageFinding[] = [];

    // Find deleted test files
    const deletedTestFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && f.changeType === 'deleted' && isTestFile(f.path)
    );

    for (const testFile of deletedTestFiles) {
      findings.push({
        id: generateId('test-deletion', testFile.path, 1),
        severity: 'high',
        category: 'test-coverage',
        title: `Test file deleted`,
        explanation: `The test file "${testFile.path}" was deleted. Test coverage may be reduced. Ensure the deleted tests are no longer needed or their coverage is maintained.`,
        file: testFile.path,
        introducedBy: 'deleted',
        pattern: 'test-deleted',
        confidence: 95,
        coverageType: 'deleted-test',
      });
    }

    return { findings };
  },
};