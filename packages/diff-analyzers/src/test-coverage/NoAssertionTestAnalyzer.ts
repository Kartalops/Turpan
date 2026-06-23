/**
 * NoAssertionTestAnalyzer — tests changed but appear to have no assertions
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext } from '../types.js';
import type { TestCoverageFinding } from './types.js';

const TEST_DIRS = ['test/', 'tests/', '__tests__/', '__spec__/'];

const ASSERTION_PATTERNS = [
  /\bexpect\s*\(/,                    // Jest expect()
  /\bassert\s*\./,                    // Node assert
  /\bshould\s*\./,                    // Should.js
  /\btoBe\s*\(/,                      // Jasmine/Jest
  /\btoEqual\s*\(/,                   // Jest
  /\btoStrictEqual\s*\(/,             // Jest
  /\btoThrow\s*\(/,                   // Jest
  /\.resolves\b/,                     // Jest
  /\.rejects\b/,                      // Jest
  /chai\.expect\s*\(/,                // Chai
  /chai\.assert\s*\./,                // Chai
  /should\.exist\s*\(/,               // Should.js
  /expect\s*\(\s*page/,               // Playwright
  /\bsupertest\b.*\.expect\s*\(/,     // Supertest
];

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    TEST_DIRS.some((dir) => lower.includes(dir)) ||
    /\.test\./.test(lower) ||
    /\.spec\./.test(lower)
  );
}

function hasAnyAssertion(content: string): boolean {
  // Remove comments to avoid false positives
  const withoutComments = content
    .replace(/\/\/.*$/gm, '')  // Single line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');  // Multi-line comments

  return ASSERTION_PATTERNS.some((pattern) => pattern.test(withoutComments));
}

function isOrganizationalBlock(line: string): boolean {
  // Skip describe/it/test/before/after blocks that are clearly for organization
  const orgPattern = /^\s*(describe|it|test|suite|context|before|after|beforeEach|afterEach)\s*\(\s*['"]/;
  return orgPattern.test(line);
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const NoAssertionTestAnalyzer: DiffScopedAnalyzer = {
  id: 'no-assertion',
  name: 'No Assertion Test Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: TestCoverageFinding[] }> {
    const findings: TestCoverageFinding[] = [];

    // Find changed test files (not deleted ones - handled by TestDeletionAnalyzer)
    const changedTestFiles = ctx.diffResult.files.filter(
      (f) =>
        !f.binary &&
        f.changeType !== 'deleted' &&
        isTestFile(f.path)
    );

    for (const testFile of changedTestFiles) {
      // Get hunks for this file
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === testFile.path);

      // Collect all non-comment, non-organizational lines
      const testLines: string[] = [];
      for (const hunk of fileHunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added' || line.type === 'context') {
            const trimmed = line.content.trim();
            // Skip empty lines and purely organizational blocks
            if (trimmed && !isOrganizationalBlock(trimmed)) {
              testLines.push(line.content);
            }
          }
        }
      }

      const content = testLines.join('\n');

      // Skip if too few lines (probably just template)
      if (testLines.length < 3) continue;

      if (!hasAnyAssertion(content)) {
        findings.push({
          id: generateId('no-assertion', testFile.path, 1),
          severity: 'medium',
          category: 'test-coverage',
          title: `Test file appears to have no assertions`,
          explanation: `The test file "${testFile.path}" was ${testFile.changeType} but no assertion patterns were detected. A test without assertions may not be validating anything.`,
          file: testFile.path,
          introducedBy: testFile.changeType as TestCoverageFinding['introducedBy'],
          pattern: 'no-assertion',
          confidence: 70,
          coverageType: 'no-assertion',
        });
      }
    }

    return { findings };
  },
};