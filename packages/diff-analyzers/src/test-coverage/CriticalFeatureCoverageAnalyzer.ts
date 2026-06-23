/**
 * CriticalFeatureCoverageAnalyzer — auth/billing/admin changes without test coverage
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext } from '../types.js';
import type { TestCoverageFinding } from './types.js';

const AUTH_PATTERNS = [
  /auth/i,
  /login/i,
  /signin/i,
  /signup/i,
  /password/i,
  /session/i,
  /token/i,
  /jwt/i,
  /oauth/i,
  /permission/i,
  /role/i,
  /access/i,
  /mfa/i,
  /2fa/i,
];

const BILLING_PATTERNS = [
  /billing/i,
  /payment/i,
  /invoice/i,
  /subscription/i,
  /price/i,
  /plan/i,
  /checkout/i,
  /stripe/i,
  /charge/i,
  /subscription/i,
];

const ADMIN_PATTERNS = [
  /admin/i,
  /dashboard/i,
  /manage/i,
  /user-management/i,
];

const TEST_DIRS = ['test/', 'tests/', '__tests__/', '__spec__/'];

function isCriticalFeature(path: string): { type: 'auth' | 'billing' | 'admin'; matched: string } | null {
  const lower = path.toLowerCase();

  for (const pattern of AUTH_PATTERNS) {
    if (pattern.test(lower)) return { type: 'auth', matched: pattern.source };
  }
  for (const pattern of BILLING_PATTERNS) {
    if (pattern.test(lower)) return { type: 'billing', matched: pattern.source };
  }
  for (const pattern of ADMIN_PATTERNS) {
    if (pattern.test(lower)) return { type: 'admin', matched: pattern.source };
  }

  return null;
}

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

export const CriticalFeatureCoverageAnalyzer: DiffScopedAnalyzer = {
  id: 'critical-feature-coverage',
  name: 'Critical Feature Coverage Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: TestCoverageFinding[] }> {
    const findings: TestCoverageFinding[] = [];

    // Find changed critical feature files
    const criticalFiles = ctx.diffResult.files.filter(
      (f) =>
        !f.binary &&
        f.changeType !== 'deleted' &&
        isCriticalFeature(f.path) !== null
    );

    if (criticalFiles.length === 0) {
      return { findings };
    }

    // Check if any test file was also changed
    const testFilesChanged = ctx.diffResult.files.some(
      (f) => !f.binary && f.changeType !== 'deleted' && isTestFile(f.path)
    );

    for (const criticalFile of criticalFiles) {
      const featureInfo = isCriticalFeature(criticalFile.path)!;

      if (!testFilesChanged) {
        findings.push({
          id: generateId('critical-feature-coverage', criticalFile.path, 1),
          severity: 'high',
          category: 'test-coverage',
          title: `Critical ${featureInfo.type} feature changed without test coverage`,
          explanation: `The ${featureInfo.type} related file "${criticalFile.path}" was ${criticalFile.changeType} but no test file was modified. Given the critical nature of ${featureInfo.type} features, tests should be added or updated.`,
          file: criticalFile.path,
          introducedBy: criticalFile.changeType as TestCoverageFinding['introducedBy'],
          pattern: `critical:${featureInfo.type}`,
          confidence: 85,
          coverageType: 'critical-unchanged',
        });
      }
    }

    return { findings };
  },
};