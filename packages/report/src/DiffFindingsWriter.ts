/**
 * DiffFindingsWriter — produces TURPAN_DIFF_FINDINGS.json
 *
 * Machine-readable structured output for CI systems consuming a diff review.
 */

import { join } from 'path';
import type { Finding } from '@turpan/core';
import type { TurpanAnalysisData } from './types.js';

export interface TurpanDiffFindingsJson {
  version: string;
  runId: string;
  timestamp: string;
  projectPath: string;
  verdict: string;
  overallScore: number;
  /** Diff review metadata */
  diff: {
    baseRef: string;
    targetRef: string;
    totalFiles: number;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    filesRenamed: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
  };
  /** Recommendation for the PR */
  recommendation: {
    decision: 'approve' | 'request_changes' | 'block_merge';
    confidence: 'high' | 'medium' | 'low';
    summary: string;
    reasons: string[];
  };
  /** Risk per changed file */
  riskByFile: Array<{
    file: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    changeType: string;
    linesAdded: number;
    linesDeleted: number;
  }>;
  /** Changed routes/APIs/components */
  changedSurface: {
    routes: string[];
    apis: string[];
    components: string[];
    ownership: Array<{ file: string; ownership: string }>;
  };
  /** Findings that are specifically caused by / located in the diff */
  diffFindings: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    explanation: string;
    file?: string;
    line?: number;
    introducedBy: string;
  }>;
  /** All findings (same schema as TURPAN_FINDINGS.json) */
  allFindings: Array<{
    id: string;
    title: string;
    severity: string;
    category: string;
    explanation: string;
    file?: string;
    line?: number;
    suggestedFix?: string;
    fixable: string;
    confidence: number;
    tags: string[];
  }>;
  /** Findings specifically introduced by this diff (not pre-existing) */
  introducedFindings: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    explanation: string;
    file?: string;
    line?: number;
    introducedBy: string;
    confidence: number;
  }>;
  /** Findings from pre-existing code that are still present */
  preExistingFindings: Array<{ id: string; title: string; file?: string }>;
  /** Test coverage assessment for the diff */
  testCoverage: {
    status: 'adequate' | 'inadequate' | 'missing' | 'not-applicable';
    criticalFeaturesTested: boolean;
    testFilesChanged: number;
    sourceFilesChanged: number;
    missingTestFiles: string[];
    deletedTestFiles: string[];
    testsWithoutAssertions: string[];
  };
  /** Merge decision with full reasoning */
  mergeDecision: {
    decision: 'approve' | 'request_changes' | 'block_merge';
    confidence: 'high' | 'medium' | 'low';
    blockers: string[];
    warnings: string[];
    mustFix: string[];
    niceToFix: string[];
  };
  /** Severity breakdown */
  severityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export class DiffFindingsWriter {
  constructor(private data: TurpanAnalysisData) {}

  async write(runPath: string): Promise<string> {
    const { mkdirSync, writeFileSync } = await import('fs');
    const content = JSON.stringify(this.build(), null, 2);
    mkdirSync(runPath, { recursive: true });
    const dest = join(runPath, 'TURPAN_DIFF_FINDINGS.json');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  build(): TurpanDiffFindingsJson {
    const { runId, timestamp, projectPath, findings, verdict, scorecard, diffReview } = this.data;

    const diffMeta = {
      baseRef: diffReview?.baseRef ?? 'unknown',
      targetRef: diffReview?.targetRef ?? 'unknown',
      totalFiles: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesRenamed: 0,
      totalLinesAdded: 0,
      totalLinesDeleted: 0,
    };

    const rec = diffReview?.recommendation ?? 'request_changes';
    const breakdown = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high:     findings.filter(f => f.severity === 'high').length,
      medium:   findings.filter(f => f.severity === 'medium').length,
      low:      findings.filter(f => f.severity === 'low').length,
      info:     findings.filter(f => f.severity === 'info').length,
    };

    // Separate introduced vs pre-existing findings
    const diffScopedTags = new Set(['diff-scoped', 'introduced-by-diff']);
    const introducedFindings = findings.filter(f =>
      f.tags?.some(t => diffScopedTags.has(t)) ||
      (f.file != null && diffReview?.changedRoutes?.some(r => f.file?.includes(r)))
    );
    const preExistingFindings = findings.filter(f => !introducedFindings.includes(f));

    const testCoverage = diffReview?.testCoverage ?? {
      status: 'not-applicable' as const,
      criticalFeaturesTested: false,
      testFilesChanged: 0,
      sourceFilesChanged: 0,
      missingTestFiles: [],
      deletedTestFiles: [],
      testsWithoutAssertions: [],
    };

    const mergeDecision = diffReview?.mergeDecision ?? {
      decision: rec,
      blockers: [],
      warnings: [],
    };

    return {
      version: '1.0.0',
      runId,
      timestamp,
      projectPath,
      verdict,
      overallScore: scorecard.overall,
      diff: diffMeta,
      recommendation: {
        decision: rec,
        confidence: diffReview?.confidence ?? 'medium',
        summary: diffReview?.summary ?? 'No diff review summary available.',
        reasons: diffReview?.findingsIntroducedByDiff ?? [],
      },
      riskByFile: (diffReview?.riskByFile ?? []).map(rf => ({
        file: rf.file,
        risk: rf.risk,
        reason: rf.reason,
        changeType: 'modified',
        linesAdded: 0,
        linesDeleted: 0,
      })),
      changedSurface: {
        routes: diffReview?.changedRoutes ?? [],
        apis: diffReview?.changedApis ?? [],
        components: diffReview?.changedComponents ?? [],
        ownership: [],
      },
      diffFindings: findings.map(f => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        introducedBy: 'modified',
      })),
      allFindings: findings.map(f => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        category: f.category,
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        suggestedFix: f.suggestedFix,
        fixable: f.fixable,
        confidence: f.confidence,
        tags: f.tags,
      })),
      introducedFindings: introducedFindings.map(f => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        introducedBy: 'diff',
        confidence: f.confidence,
      })),
      preExistingFindings: preExistingFindings.map(f => ({
        id: f.id,
        title: f.title,
        file: f.file,
      })),
      testCoverage,
      mergeDecision: {
        decision: mergeDecision.decision,
        confidence: diffReview?.confidence ?? 'medium',
        blockers: mergeDecision.blockers,
        warnings: mergeDecision.warnings,
        mustFix: mergeDecision.blockers,
        niceToFix: mergeDecision.warnings,
      },
      severityBreakdown: breakdown,
    };
  }
}