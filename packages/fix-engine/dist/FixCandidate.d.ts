/**
 * FixCandidate — wraps a Finding with fix metadata and generates replacement snippets.
 */
import type { Finding } from '@turpan/core';
import type { FixCandidate, FixCategory, ValidationCheck } from './types.js';
/**
 * Read a file and extract the lines for a fix candidate.
 * Falls back gracefully if the file can't be read.
 */
export declare function extractSnippet(filePath: string, startLine: number, endLine: number): string;
/**
 * Create a FixCandidate from a Finding.
 * Returns null if the finding is not fixable.
 */
export declare function createFixCandidate(finding: Finding, projectRoot: string): FixCandidate | null;
/**
 * Create multiple FixCandidates from a list of Findings.
 * Filters out non-fixable findings.
 */
export declare function createFixCandidates(findings: Finding[], projectRoot: string): FixCandidate[];
/**
 * Filter candidates by category.
 */
export declare function filterByCategory(candidates: FixCandidate[], category: FixCategory): FixCandidate[];
/**
 * Filter candidates that pass the minimum confidence threshold.
 */
export declare function filterByConfidence(candidates: FixCandidate[], threshold: number): FixCandidate[];
/**
 * Return candidates that should be auto-applied in auto-safe mode.
 */
export declare function getAutoSafeCandidates(candidates: FixCandidate[]): FixCandidate[];
/**
 * Get all validation checks needed across a set of candidates (deduplicated).
 */
export declare function aggregateRequiredChecks(candidates: FixCandidate[]): ValidationCheck[];
/**
 * Group candidates by file.
 */
export declare function groupByFile(candidates: FixCandidate[]): Map<string, FixCandidate[]>;
//# sourceMappingURL=FixCandidate.d.ts.map