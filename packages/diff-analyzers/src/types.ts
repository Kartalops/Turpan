/**
 * @turpan/diff-analyzers — Diff-scoped analyzer types
 */

import type { GitDiffResult } from '@turpan/git-diff';

export interface DiffScopedFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'correctness' | 'test-coverage';
  title: string;
  explanation: string;
  file?: string;
  line?: number;
  diffLines?: Array<{
    lineNum: number;
    content: string;
    type: 'context' | 'added' | 'deleted';
  }>;
  introducedBy: 'added' | 'modified' | 'deleted' | 'renamed';
  pattern: string;
  /** Confidence score 0-100; defaults to 90 for strong pattern matches, 70 for heuristics */
  confidence: number;
}

export interface DiffScopedAnalyzerContext {
  diffResult: GitDiffResult;
  projectRoot: string;
}

export interface DiffScopedAnalyzer {
  id: string;
  name: string;
  run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }>;
}