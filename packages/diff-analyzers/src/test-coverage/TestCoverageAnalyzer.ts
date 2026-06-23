/**
 * TestCoverageAnalyzer — runs all test coverage analyzers in parallel and merges results
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { TestCoverageFinding } from './types.js';
import { MissingTestDetector } from './MissingTestDetector.js';
import { TestDeletionAnalyzer } from './TestDeletionAnalyzer.js';
import { NoAssertionTestAnalyzer } from './NoAssertionTestAnalyzer.js';
import { CriticalFeatureCoverageAnalyzer } from './CriticalFeatureCoverageAnalyzer.js';

/**
 * All test coverage analyzers to run
 */
const TEST_COVERAGE_ANALYZERS: DiffScopedAnalyzer[] = [
  MissingTestDetector,
  TestDeletionAnalyzer,
  NoAssertionTestAnalyzer,
  CriticalFeatureCoverageAnalyzer,
];

export class TestCoverageAnalyzer {
  readonly id = 'test-coverage';
  readonly name = 'Test Coverage Analyzer';

  /**
   * Run all test coverage analyzers in parallel
   */
  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: TestCoverageFinding[] }> {
    // Run all analyzers in parallel
    const results = await Promise.all(
      TEST_COVERAGE_ANALYZERS.map((analyzer) =>
        analyzer.run(ctx).catch((err) => {
          console.error(`Error in ${analyzer.name}:`, err);
          return { findings: [] as DiffScopedFinding[] };
        })
      )
    );

    // Merge all findings
    const allFindings: TestCoverageFinding[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const finding of result.findings) {
        // Deduplicate by ID
        if (!seen.has(finding.id)) {
          seen.add(finding.id);
          allFindings.push(finding as TestCoverageFinding);
        }
      }
    }

    // Sort by severity (critical > high > medium > low > info)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return { findings: allFindings };
  }
}

export const TestCoverageAnalyzerInstance = new TestCoverageAnalyzer();