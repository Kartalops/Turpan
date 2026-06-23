/**
 * CorsAnalyzer — detects CORS wildcard introduction in diffs
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// CORS wildcard patterns
const CORS_WILDCARD_PATTERNS = [
  /Access-Control-Allow-Origin:\s*\*/i,
  /origin:\s*['"]\*['"]/i,
  /cors:\s*\{\s*origin:\s*['"]\*['"]\s*\}/i,
  /cors\(\s*\{\s*origin:\s*['"]\*['"]\s*\}\s*\)/i,
  /cors\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/i,
  /\bALLOW_ALL\b/i,
  /credentials:\s*false\b/i,
  /app\.use\s*\(\s*cors\s*\)\s*;?$/i, // cors() with defaults (may allow *)
];

// Patterns indicating existing non-wildcard CORS being changed to wildcard
const CORS_STRENGTHENING_PATTERNS = [
  /origin:\s*['"][^'"]+['"]\s*->\s*origin:\s*['"]\*['"]/,
  /Access-Control-Allow-Origin:\s*[^*]+\s*->\s*\*/,
];

// API route indicator
const API_ROUTE_PATTERNS = [
  /\/api\//i,
  /\/v\d+\//i,
  /endpoint/i,
  /route\s*\(/i,
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function isApiRoute(filePath: string, content: string): boolean {
  if (API_ROUTE_PATTERNS.some((p) => p.test(filePath))) return true;
  return API_ROUTE_PATTERNS.some((p) => p.test(content));
}

function detectCorsWildcard(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  for (const line of hunk.lines) {
    if (line.type !== 'added') continue;

    for (const pattern of CORS_WILDCARD_PATTERNS) {
      if (pattern.test(line.content)) {
        const isApi = isApiRoute(filePath, line.content);
        findings.push({
          id: `cors-wildcard-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: isApi ? 'high' : 'medium',
          category: 'security',
          title: isApi
            ? 'CORS wildcard (*) introduced on API route'
            : 'CORS wildcard (*) introduced',
          explanation: isApi
            ? `A CORS wildcard origin (*) was detected on an API route. This allows any website to make cross-origin requests to your API, which may expose sensitive data. Use a specific origin list instead.`
            : `A CORS wildcard origin (*) was detected. This allows any website to make cross-origin requests. Use a specific origin list or limit to known domains.`,
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
  }

  return findings;
}

export const CorsAnalyzer: DiffScopedAnalyzer = {
  id: 'cors-wildcard',
  name: 'CORS Wildcard Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = detectCorsWildcard(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};