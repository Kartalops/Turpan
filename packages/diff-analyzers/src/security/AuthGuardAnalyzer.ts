/**
 * AuthGuardAnalyzer — detects auth guard removal or weakening in diffs
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// Auth guard bypass / removal patterns
const GUARD_REMOVAL_PATTERNS = [
  /\/\/\s*auth\b/i,
  /\/\/\s*skip\s*auth\b/i,
  /\/\/\s*bypass\b/i,
  /skipAuth\b/i,
  /bypassAuth\b/i,
  /noAuth\b/i,
  /auth:\s*false\b/i,
  /auth:\s*0\b/i,
  /\bnoauth\b/i,
  /\bPUBLIC\b/i,
  /\bisPublic\b/i,
  /public:\s*true\b/i,
  /\ballowUnauthenticated\b/i,
  /\ballow-unauthenticated\b/i,
];

// Route files that add public access
const PUBLIC_ROUTE_PATTERNS = [
  /\bpublic\b.*?(?:route|endpoint|api|handler)/i,
  /\bskipAuth\b/i,
  /\bnoAuth\b/i,
  /\bbypass\b/i,
  /\bisPublic\b/i,
  /\ballowUnauthenticated\b/i,
  /\ballow-unauthenticated\b/i,
];

// Paths that are NOT auth issues (login/auth routes)
const AUTH_ROUTE_SKIP_PATTERNS = [
  /\/login$/i,
  /\/signin$/i,
  /\/auth\/login$/i,
  /\/auth\/signin$/i,
  /\/auth\/callback$/i,
  /\/auth\/verify$/i,
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function isAuthRoute(filePath: string): boolean {
  return AUTH_ROUTE_SKIP_PATTERNS.some((p) => p.test(filePath));
}

function checkHunkForAuthBypass(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];
  const addedLines = hunk.lines.filter((l) => l.type === 'added');
  const deletedLines = hunk.lines.filter((l) => l.type === 'deleted');

  for (const line of addedLines) {
    // Check for guard removal patterns
    for (const pattern of GUARD_REMOVAL_PATTERNS) {
      if (pattern.test(line.content)) {
        findings.push({
          id: `auth-guard-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: 'critical',
          category: 'security',
          title: 'Auth guard bypass or removal detected',
          explanation: `A pattern suggesting auth guard bypass or removal was found: "${line.content.trim()}". This may allow unauthenticated access to protected resources.`,
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
          confidence: 90,
        });
        break;
      }
    }

    // Check for public route additions
    for (const pattern of PUBLIC_ROUTE_PATTERNS) {
      if (pattern.test(line.content) && !isAuthRoute(filePath)) {
        findings.push({
          id: `auth-guard-public-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: 'high',
          category: 'security',
          title: 'Public access flag added to route',
          explanation: `A public access flag was detected on what may be a protected route: "${line.content.trim()}". Verify this route should truly be public.`,
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
          confidence: 80,
        });
        break;
      }
    }
  }

  // Check for auth middleware removal (deleted lines that look like middleware)
  for (const line of deletedLines) {
    const middlewarePattern = /\b(auth|verify|authenticate|authorize|permits?)\s*(?: middleware)?\b/i;
    if (middlewarePattern.test(line.content)) {
      findings.push({
        id: `auth-guard-middleware-removed-${filePath.split('/').pop()}-${line.oldLineNumber ?? 0}`,
        severity: 'high',
        category: 'security',
        title: 'Auth middleware appears to be removed',
        explanation: `A deleted line appears to reference auth middleware being removed: "${line.content.trim()}". This could disable authentication on a route.`,
        file: filePath,
        line: line.oldLineNumber,
        diffLines: hunk.lines
          .filter((l) => l.type === 'deleted')
          .map((l) => ({
            lineNum: l.oldLineNumber ?? 0,
            content: l.content,
            type: l.type,
          })),
        introducedBy: changeType,
        pattern: middlewarePattern.source,
        confidence: 70,
      });
    }
  }

  return findings;
}

export const AuthGuardAnalyzer: DiffScopedAnalyzer = {
  id: 'auth-guard',
  name: 'Auth Guard Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = checkHunkForAuthBypass(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};