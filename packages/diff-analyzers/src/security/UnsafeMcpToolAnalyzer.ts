/**
 * UnsafeMcpToolAnalyzer — detects unsafe MCP tool access patterns in diffs
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// MCP-related file patterns (only scan MCP-related files)
const MCP_FILE_PATTERNS = [
  /mcp/i,
  /tool.*definition/i,
  /server.*config/i,
];

// Unsafe MCP tool access patterns
const UNSAFE_MCP_PATTERNS = [
  {
    pattern: /dangerouslyAllow\s*\(\s*(?:Shell|Filesystem|Write|Read)/i,
    sink: 'dangerouslyAllow(Shell/Filesystem/Write/Read)',
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /dangerouslyAllowFs\b/i,
    sink: 'dangerouslyAllowFs',
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /dangerouslyAllowShell\b/i,
    sink: 'dangerouslyAllowShell',
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /dangerouslyAllowExec\b/i,
    sink: 'dangerouslyAllowExec',
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /file:\/\//i,
    sink: 'file:// protocol handler',
    severity: 'high' as const,
    confidence: 80,
  },
  {
    pattern: /fs:\s*\{\s*read:\s*\[\s*['"]\/['"]\s*\]/i,
    sink: 'fs: { read: ["/"] }',
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /fs:\s*\{\s*write:\s*\[\s*['"]\/['"]\s*\]/i,
    sink: 'fs: { write: ["/"] }',
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /fs:\s*['"]\*['"]/i,
    sink: "fs: '*' (wildcard)",
    severity: 'critical' as const,
    confidence: 95,
  },
  {
    pattern: /\bshell:\s*true\b/i,
    sink: 'shell: true',
    severity: 'critical' as const,
    confidence: 90,
  },
  {
    pattern: /\bexec:\s*true\b/i,
    sink: 'exec: true',
    severity: 'critical' as const,
    confidence: 90,
  },
  {
    pattern: /\bsubprocess:\s*true\b/i,
    sink: 'subprocess: true',
    severity: 'critical' as const,
    confidence: 90,
  },
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function isMcpRelatedFile(filePath: string): boolean {
  return MCP_FILE_PATTERNS.some((p) => p.test(filePath));
}

function detectUnsafeMcpTool(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  // Only analyze MCP-related files
  if (!isMcpRelatedFile(filePath)) return findings;

  for (const line of hunk.lines) {
    if (line.type !== 'added') continue;
    const content = line.content;

    for (const { pattern, sink, severity, confidence } of UNSAFE_MCP_PATTERNS) {
      if (pattern.test(content)) {
        findings.push({
          id: `unsafe-mcp-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity,
          category: 'security',
          title: `Unsafe MCP tool access: ${sink}`,
          explanation: `An unsafe MCP tool configuration was detected (${sink}). This may allow privileged access to filesystem or shell operations. Review and restrict to least-privilege principles.`,
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
          pattern: String(pattern),
          confidence,
        });
        break;
      }
    }
  }

  return findings;
}

export const UnsafeMcpToolAnalyzer: DiffScopedAnalyzer = {
  id: 'unsafe-mcp-tool',
  name: 'Unsafe MCP Tool Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = detectUnsafeMcpTool(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};