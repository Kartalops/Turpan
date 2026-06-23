/**
 * Analyzer — generic static analysis interface for Turpan
 * Analyzers are standalone units that inspect the project and return findings.
 */

import type { ProjectFingerprint } from '../project/index.js';
import type { Finding } from '../findings/Finding.js';
import type { GitDiffResult } from '@turpan/git-diff';

export interface AnalyzerContext {
  projectRoot: string;
  fingerprint: ProjectFingerprint;
  deepAnalysis: boolean;
  signal?: AbortSignal;
  /** When true, analyzers focus only on changed files from a git diff */
  diffMode?: boolean;
  /** The git diff result — required when diffMode is true */
  diffResult?: GitDiffResult;
}

export interface Analyzer {
  /** Unique identifier, e.g. "unused-dependency" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Which categories this analyzer produces */
  categories: string[];
  /** Whether this analyzer applies to the given project */
  supports(fingerprint: ProjectFingerprint): boolean;
  /** Run the analysis and return findings */
  run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
}

export interface AnalyzerResult {
  analyzerId: string;
  findings: Finding[];
  artifacts?: Record<string, unknown>;
  durationMs: number;
  errors: string[];
}

export function isAnalyzer(value: unknown): value is Analyzer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'supports' in value &&
    'run' in value
  );
}
