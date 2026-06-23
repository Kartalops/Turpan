/**
 * runAnalyzers — utility to run a set of analyzers and collect findings
 */

import type { AnalyzerContext, AnalyzerResult } from './Analyzer.js';
import { globalRegistry, type AnalyzerRegistry } from './AnalyzerRegistry.js';

/**
 * Result of running all static-quality analyzers
 */
export interface StaticQualityRunResult {
  results: AnalyzerResult[];
  totalFindings: number;
  findingsByCategory: Map<string, AnalyzerResult[]>;
  findingsByAnalyzer: Map<string, AnalyzerResult>;
  errors: string[];
  totalDurationMs: number;
}

export async function runStaticQualityAnalyzers(
  ctx: AnalyzerContext,
  registry: AnalyzerRegistry = globalRegistry
): Promise<StaticQualityRunResult> {
  const applicable = registry.applicableTo(ctx.fingerprint);
  const results: AnalyzerResult[] = [];
  const errors: string[] = [];
  const start = Date.now();

  for (const analyzer of applicable) {
    if (ctx.signal?.aborted) break;
    const aStart = Date.now();
    try {
      const result = await analyzer.run(ctx);
      results.push({ ...result, analyzerId: analyzer.id, durationMs: Date.now() - aStart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${analyzer.id}] ${msg}`);
      results.push({
        analyzerId: analyzer.id,
        findings: [],
        durationMs: Date.now() - aStart,
        errors: [msg],
      });
    }
  }

  const findingsByCategory = registry.groupByCategory(results);
  const findingsByAnalyzer = new Map(results.map(r => [r.analyzerId, r]));

  return {
    results,
    totalFindings: results.reduce((n, r) => n + r.findings.length, 0),
    findingsByCategory,
    findingsByAnalyzer,
    errors,
    totalDurationMs: Date.now() - start,
  };
}

/**
 * Categorize findings into cleanup safety tiers
 */
export interface CleanupCandidate {
  finding: AnalyzerResult['findings'][number];
  analyzerId: string;
  risk: 'safe' | 'risky' | 'unknown';
  reason: string;
}

export function categorizeCleanupCandidates(
  results: AnalyzerResult[]
): { safe: CleanupCandidate[]; risky: CleanupCandidate[]; unknown: CleanupCandidate[] } {
  const safe: CleanupCandidate[] = [];
  const risky: CleanupCandidate[] = [];
  const unknown: CleanupCandidate[] = [];

  for (const result of results) {
    for (const finding of result.findings) {
      const candidate: CleanupCandidate = {
        finding,
        analyzerId: result.analyzerId,
        risk: 'unknown',
        reason: '',
      };

      // Safe: unused deps, clearly orphaned files, obvious placeholders
      if (
        result.analyzerId === 'unused-dependency' ||
        result.analyzerId === 'placeholder-implementation'
      ) {
        candidate.risk = finding.file ? 'safe' : 'risky';
        candidate.reason = 'Confirmed unused or placeholder';
      } else if (result.analyzerId === 'unused-file') {
        candidate.risk = 'safe';
        candidate.reason = 'File has no import references';
      } else if (result.analyzerId === 'unused-export') {
        candidate.risk = 'risky';
        candidate.reason = 'May be used via dynamic imports or reflection';
      } else if (result.analyzerId === 'duplicate-code') {
        candidate.risk = 'risky';
        candidate.reason = 'Requires manual review to determine if deduplication is safe';
      } else if (result.analyzerId === 'complexity-hotspot') {
        candidate.risk = 'risky';
        candidate.reason = 'Refactoring may introduce bugs without tests';
      } else if (result.analyzerId === 'architecture-basic') {
        candidate.risk = 'unknown';
        candidate.reason = 'Architectural issue requires design review';
      }

      if (candidate.risk === 'safe') safe.push(candidate);
      else if (candidate.risk === 'risky') risky.push(candidate);
      else unknown.push(candidate);
    }
  }

  return { safe, risky, unknown };
}
