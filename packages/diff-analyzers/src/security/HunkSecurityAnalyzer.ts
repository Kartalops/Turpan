/**
 * HunkSecurityAnalyzer — master orchestrator that runs all 8 sub-analyzers
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import { HardcodedSecretAnalyzer } from './HardcodedSecretAnalyzer.js';
import { AuthGuardAnalyzer } from './AuthGuardAnalyzer.js';
import { AdminRouteAnalyzer } from './AdminRouteAnalyzer.js';
import { CorsAnalyzer } from './CorsAnalyzer.js';
import { SqlInjectionAnalyzer } from './SqlInjectionAnalyzer.js';
import { XssAnalyzer } from './XssAnalyzer.js';
import { UnsafeExecutionAnalyzer } from './UnsafeExecutionAnalyzer.js';
import { UnsafeMcpToolAnalyzer } from './UnsafeMcpToolAnalyzer.js';

const ALL_ANALYZERS: DiffScopedAnalyzer[] = [
  HardcodedSecretAnalyzer,
  AuthGuardAnalyzer,
  AdminRouteAnalyzer,
  CorsAnalyzer,
  SqlInjectionAnalyzer,
  XssAnalyzer,
  UnsafeExecutionAnalyzer,
  UnsafeMcpToolAnalyzer,
];

export class DiffScopedSecurityAnalyzers {
  readonly analyzers: DiffScopedAnalyzer[];

  constructor(analyzers: DiffScopedAnalyzer[] = ALL_ANALYZERS) {
    this.analyzers = analyzers;
  }

  /**
   * Run all analyzers in parallel and merge/deduplicate findings.
   */
  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const results = await Promise.all(this.analyzers.map((a) => a.run(ctx)));

    // Merge all findings
    const allFindings: DiffScopedFinding[] = results.flatMap((r) => r.findings);

    // Deduplicate by id
    const seen = new Set<string>();
    const unique: DiffScopedFinding[] = [];
    for (const f of allFindings) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        unique.push(f);
      }
    }

    return { findings: unique };
  }
}

export { HardcodedSecretAnalyzer } from './HardcodedSecretAnalyzer.js';
export { AuthGuardAnalyzer } from './AuthGuardAnalyzer.js';
export { AdminRouteAnalyzer } from './AdminRouteAnalyzer.js';
export { CorsAnalyzer } from './CorsAnalyzer.js';
export { SqlInjectionAnalyzer } from './SqlInjectionAnalyzer.js';
export { XssAnalyzer } from './XssAnalyzer.js';
export { UnsafeExecutionAnalyzer } from './UnsafeExecutionAnalyzer.js';
export { UnsafeMcpToolAnalyzer } from './UnsafeMcpToolAnalyzer.js';