/**
 * PatchGenerator — produces unified diff patches from FixCandidates.
 *
 * Diffs are generated in standard unified format, compatible with `git apply`.
 * Files are processed in a stable order (alphabetically) to produce deterministic output.
 *
 * Uses a simple line-by-line LCS diff to produce unified diff output.
 */
import type { FixCandidate, PatchResult } from './types.js';
/**
 * Generate a unified diff string for a single FixCandidate.
 */
export declare function generateSinglePatch(candidate: FixCandidate): string;
/**
 * Generate a complete patch (unified diff) from a list of FixCandidates.
 * Files are processed alphabetically; within a file, candidates are sorted by line number.
 */
export declare function generatePatch(candidates: FixCandidate[]): PatchResult;
/**
 * Format patch as a dated header comment.
 */
export declare function formatPatchHeader(mode: string, projectRoot: string): string;
//# sourceMappingURL=PatchGenerator.d.ts.map