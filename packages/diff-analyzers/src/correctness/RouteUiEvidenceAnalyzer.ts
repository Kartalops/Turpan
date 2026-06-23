/**
 * RouteUiEvidenceAnalyzer — detect route/page changes without UI test evidence
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';

const ROUTE_DIRS = [
  'app/',      // Next.js App Router
  'pages/',    // Next.js Pages Router, Nuxt
];

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.e2e\./,
  /__screenshots__/,
];

function isRouteFile(path: string): boolean {
  const lower = path.toLowerCase();

  // Check if in a route directory
  if (!ROUTE_DIRS.some((dir) => lower.includes(dir))) return false;

  // Exclude test files themselves
  if (TEST_PATTERNS.some((p) => p.test(lower))) return false;

  // Skip node_modules and other non-route dirs
  const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'];
  if (skipDirs.some((dir) => lower.includes(dir))) return false;

  return true;
}

function isTestEvidenceFile(path: string): boolean {
  const lower = path.toLowerCase();
  return TEST_PATTERNS.some((p) => p.test(lower));
}

function getRouteName(filePath: string): string | null {
  // Extract route name from path
  // e.g., "app/users/page.tsx" -> "users"
  // e.g., "pages/api/data.ts" -> "api/data"

  const appMatch = filePath.match(/app\/(.+?)[\/.]/);
  if (appMatch) return appMatch[1]!;

  const pagesMatch = filePath.match(/pages\/(.+?)[\/.]/);
  if (pagesMatch) return pagesMatch[1]!;

  return null;
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const RouteUiEvidenceAnalyzer: DiffScopedAnalyzer = {
  id: 'route-ui-evidence',
  name: 'Route UI Evidence Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    // Find changed route files
    const routeFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isRouteFile(f.path)
    );

    if (routeFiles.length === 0) {
      return { findings };
    }

    // Check if any test evidence files were also changed
    const testEvidenceChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isTestEvidenceFile(f.path)
    );

    for (const routeFile of routeFiles) {
      const changeType = routeFile.changeType as DiffScopedFinding['introducedBy'];
      const routeName = getRouteName(routeFile.path);

      if (!testEvidenceChanged) {
        findings.push({
          id: generateId('route-ui-evidence', routeFile.path, 1),
          severity: 'low',
          category: 'correctness',
          title: `Route changed without UI test evidence`,
          explanation: routeName
            ? `The route "${routeName}" was ${changeType} but no test file or screenshot evidence exists. Consider adding a test to verify UI behavior.`
            : `Route file was ${changeType} but no test file or screenshot evidence exists. Consider adding a test to verify UI behavior.`,
          file: routeFile.path,
          introducedBy: changeType,
          pattern: 'route-change',
          confidence: 60,
        });
      }
    }

    return { findings };
  },
};