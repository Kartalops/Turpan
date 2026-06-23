/**
 * UnsafeExecutionAnalyzer — detects unsafe code execution in diffs
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// Unsafe execution patterns
const UNSAFE_EXEC_PATTERNS = [
  /\beval\s*\(/i,
  /\bnew\s+Function\s*\(/i,
  /\bexec\s*\(/i,
  /\bexecSync\s*\(/i,
  /\bspawn\s*\(/i,
  /\bspawnSync\s*\(/i,
  /\bexecFile\s*\(/i,
  /\bexecFileSync\s*\(/i,
  /\bchild_process\b/i,
  /import\s*\(\s*['"]child_process['"]\s*\)/i,
  /require\s*\(\s*['"]child_process['"]\s*\)/i,
  /\bprocess\.binding\s*\(/i,
  /\bprocess\.dlopen\s*\(/i,
];

// User-controlled input sources
const USER_INPUT_SOURCES = [
  /\breq\.(params|query|body|headers)/i,
  /\brequest\.(params|query|body|headers)/i,
  /\bctx\.request\./i,
  /\bevent\.path\b/i,
  /\bevent\.query\b/i,
  /\bevent\.body\b/i,
  /\bparams\./i,
  /\bquery\./i,
  /\bbody\./i,
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function containsUserInput(content: string): boolean {
  return USER_INPUT_SOURCES.some((p) => p.test(content));
}

function detectUnsafeExecution(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  for (const line of hunk.lines) {
    if (line.type !== 'added') continue;
    const content = line.content;

    for (const pattern of UNSAFE_EXEC_PATTERNS) {
      if (pattern.test(content)) {
        const hasUserInput = containsUserInput(content);

        findings.push({
          id: `unsafe-exec-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: hasUserInput ? 'critical' : 'high',
          category: 'security',
          title: 'Unsafe code execution detected',
          explanation: hasUserInput
            ? `An unsafe execution pattern (${pattern.source}) was detected with user input flowing into it. This is a critical code execution vulnerability. User input must never reach these sinks.`
            : `An unsafe execution pattern (${pattern.source}) was detected. This can be dangerous if user input reaches it. Ensure proper input validation.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines
            .filter((l) => l.type === 'added')
            .map((l) => ({
              lineNum: l.newLineNumber ?? 0,
              content: l.content,
              type: l.type,
            })),
          introducedBy: changeType,
          pattern: pattern.source,
          confidence: hasUserInput ? 95 : 85,
        });
        break;
      }
    }
  }

  return findings;
}

export const UnsafeExecutionAnalyzer: DiffScopedAnalyzer = {
  id: 'unsafe-execution',
  name: 'Unsafe Execution Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = detectUnsafeExecution(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};