/**
 * ChangedSurfaceAnalyzer — runs all correctness analyzers in parallel and merges results
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import { ApiContractAnalyzer } from './ApiContractAnalyzer.js';
import { FunctionSignatureAnalyzer } from './FunctionSignatureAnalyzer.js';
import { SchemaMigrationAnalyzer } from './SchemaMigrationAnalyzer.js';
import { EnvConfigAnalyzer } from './EnvConfigAnalyzer.js';
import { DependencyAnalyzer } from './DependencyAnalyzer.js';
import { RouteUiEvidenceAnalyzer } from './RouteUiEvidenceAnalyzer.js';

/**
 * All correctness analyzers to run
 */
const CORRECTNESS_ANALYZERS: DiffScopedAnalyzer[] = [
  ApiContractAnalyzer,
  FunctionSignatureAnalyzer,
  SchemaMigrationAnalyzer,
  EnvConfigAnalyzer,
  DependencyAnalyzer,
  RouteUiEvidenceAnalyzer,
];

export class ChangedSurfaceAnalyzer {
  readonly id = 'changed-surface';
  readonly name = 'Changed Surface Analyzer';

  /**
   * Run all correctness analyzers in parallel
   */
  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    // Run all analyzers in parallel
    const results = await Promise.all(
      CORRECTNESS_ANALYZERS.map((analyzer) =>
        analyzer.run(ctx).catch((err) => {
          console.error(`Error in ${analyzer.name}:`, err);
          return { findings: [] };
        })
      )
    );

    // Merge all findings
    const allFindings: DiffScopedFinding[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const finding of result.findings) {
        // Deduplicate by ID
        if (!seen.has(finding.id)) {
          seen.add(finding.id);
          allFindings.push(finding);
        }
      }
    }

    // Sort by severity (critical > high > medium > low > info)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return { findings: allFindings };
  }
}

export const ChangedSurfaceAnalyzerInstance = new ChangedSurfaceAnalyzer();