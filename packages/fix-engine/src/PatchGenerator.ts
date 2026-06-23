/**
 * PatchGenerator — produces unified diff patches from FixCandidates.
 *
 * Diffs are generated in standard unified format, compatible with `git apply`.
 * Files are processed in a stable order (alphabetically) to produce deterministic output.
 *
 * Uses a simple line-by-line LCS diff to produce unified diff output.
 */

import { basename } from 'path';
import type { FixCandidate, PatchResult } from './types.js';
import { groupByFile } from './FixCandidate.js';

interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'context';
}

// ─── Simple Line Diff ─────────────────────────────────────────────────────────

/**
 * Compute a line-by-line diff between original and replacement.
 * Returns an array of DiffLines.
 */
function computeLineDiff(original: string, replacement: string): DiffLine[] {
  const origLines = original.split('\n');
  const replLines = replacement.split('\n');

  // Simple LCS-based diff
  const m = origLines.length;
  const n = replLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === replLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build the diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  // Collect diff operations (need to reverse at the end)
  const ops: Array<{ line: string; type: DiffLine['type'] }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === replLines[j - 1]) {
      ops.unshift({ line: origLines[i - 1], type: 'context' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ line: replLines[j - 1], type: 'added' });
      j--;
    } else {
      ops.unshift({ line: origLines[i - 1], type: 'removed' });
      i--;
    }
  }

  // Convert ops to DiffLines, removing trailing empty strings from split
  for (const op of ops) {
    if (op.type === 'context') {
      result.push({ text: op.line, type: 'context' });
    } else if (op.type === 'added') {
      result.push({ text: op.line, type: 'added' });
    } else {
      result.push({ text: op.line, type: 'removed' });
    }
  }

  return result;
}

/**
 * Generate a unified diff string for a single FixCandidate.
 */
export function generateSinglePatch(candidate: FixCandidate): string {
  const relPath = basename(candidate.filePath) || candidate.filePath;
  const start = candidate.startLine;

  const diffLines = computeLineDiff(candidate.originalSnippet, candidate.replacementSnippet);

  // Count context/added/removed
  let oldCount = 0;
  let newCount = 0;
  for (const l of diffLines) {
    if (l.type === 'removed') oldCount++;
    else if (l.type === 'added') newCount++;
    else { oldCount++; newCount++; }
  }

  const lines: string[] = [];
  lines.push(`--- a/${relPath}`);
  lines.push(`+++ b/${relPath}`);
  lines.push(`@@ -${start},${Math.max(1, oldCount)} +${start},${Math.max(1, newCount)} @@ ${candidate.description}`);

  for (const l of diffLines) {
    if (l.type === 'removed') lines.push(`-${l.text}`);
    else if (l.type === 'added') lines.push(`+${l.text}`);
    else lines.push(` ${l.text}`);
  }

  return lines.join('\n');
}

/**
 * Generate a complete patch (unified diff) from a list of FixCandidates.
 * Files are processed alphabetically; within a file, candidates are sorted by line number.
 */
export function generatePatch(candidates: FixCandidate[]): PatchResult {
  if (candidates.length === 0) {
    return {
      success: true,
      diff: '',
      filesModified: [],
      filesCreated: [],
      filesDeleted: [],
      patchContent: '',
    };
  }

  const byFile = groupByFile(candidates);
  const sortedFiles = Array.from(byFile.keys()).sort();

  const allLines: string[] = [];
  const filesModified = new Set<string>();
  const filesCreated = new Set<string>();
  const filesDeleted = new Set<string>();

  for (const filePath of sortedFiles) {
    const fileCandidates = byFile.get(filePath)!.sort(
      (a, b) => a.startLine - b.startLine
    );

    for (const candidate of fileCandidates) {
      // Check for file deletion marker (endLine >= 999999)
      if (
        candidate.replacementSnippet === '' &&
        candidate.originalSnippet !== '' &&
        candidate.startLine === 1 &&
        candidate.endLine >= 999999
      ) {
        filesDeleted.add(filePath);
      } else {
        filesModified.add(filePath);
      }

      const patch = generateSinglePatch(candidate);
      allLines.push(patch);
      allLines.push('');
    }
  }

  const patchContent = allLines.join('\n');

  return {
    success: true,
    diff: patchContent,
    filesModified: Array.from(filesModified),
    filesCreated: Array.from(filesCreated),
    filesDeleted: Array.from(filesDeleted),
    patchContent,
  };
}

/**
 * Format patch as a dated header comment.
 */
export function formatPatchHeader(mode: string, projectRoot: string): string {
  const date = new Date().toISOString();
  return `# Turpan Fix Patch — ${mode}
# Project: ${projectRoot}
# Generated: ${date}
# This patch was generated by Turpan Safe Fix Engine.
# Review before applying. Use: git apply --check <this-file>
#
`;
}
