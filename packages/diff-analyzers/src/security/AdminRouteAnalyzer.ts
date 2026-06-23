/**
 * AdminRouteAnalyzer — detects new admin routes added without auth checks
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// Admin route path patterns
const ADMIN_ROUTE_PATTERNS = [
  /^\/?admin/i,
  /^\/?dashboard/i,
  /^\/?manage/i,
  /^\/?api\/admin/i,
  /^\/?api\/manage/i,
  /^\/?api\/dashboard/i,
  /^\/?api\/users/i,
  /^\/?api\/roles/i,
  /^\/?api\/permissions/i,
  /^\/?api\/access/i,
  /^\/?root/i,
  /^\/?api\/settings/i,
];

// User settings — not an admin route
const USER_SETTINGS_PATTERN = /\/settings\//i;

// Auth-related words that indicate protection is present
const AUTH_PROTECTION_WORDS = [
  /\bauth\b/i,
  /\bguard\b/i,
  /\bmiddleware\b/i,
  /\bpermission\b/i,
  /\brole\b/i,
  /\brequire\b/i,
  /\bauthorized\b/i,
  /\bauthenticated\b/i,
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function isAdminRoutePath(filePath: string): boolean {
  if (USER_SETTINGS_PATTERN.test(filePath)) return false;
  // Strip common prefixes so /src/api/admin/... matches /api/admin/... patterns
  const normalized = filePath.replace(/^\/?(src|app)\//, '');
  return ADMIN_ROUTE_PATTERNS.some((p) => p.test('/' + normalized));
}

function hasAuthProtection(content: string): boolean {
  return AUTH_PROTECTION_WORDS.some((p) => p.test(content));
}

function checkHunkForAdminRoutes(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  if (!isAdminRoutePath(filePath)) return findings;

  // Get all added and modified lines from the hunk
  const addedLines = hunk.lines.filter((l) => l.type === 'added');
  const contextLines = hunk.lines.filter((l) => l.type === 'context');

  // Combine content for auth check
  const allContent = [...addedLines, ...contextLines].map((l) => l.content).join('\n');

  // If the file doesn't contain any auth protection, flag it
  if (!hasAuthProtection(allContent)) {
    const addedContent = addedLines.map((l) => l.content).join('\n');

    findings.push({
      id: `admin-route-${filePath.split('/').pop()}-${hunk.newStart}`,
      severity: 'high',
      category: 'security',
      title: 'Admin route added without auth checks',
      explanation: `An admin, dashboard, or management route was added/modified (${filePath}) but no auth, guard, middleware, permission, or role checks were detected in the surrounding code. This could allow unauthorized access.`,
      file: filePath,
      line: hunk.newStart,
      diffLines: addedLines.map((l) => ({
        lineNum: l.newLineNumber ?? 0,
        content: l.content,
        type: l.type,
      })),
      introducedBy: changeType,
      pattern: 'admin-route-without-auth',
      confidence: 85,
    });
  }

  return findings;
}

export const AdminRouteAnalyzer: DiffScopedAnalyzer = {
  id: 'admin-route',
  name: 'Admin Route Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = checkHunkForAdminRoutes(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};