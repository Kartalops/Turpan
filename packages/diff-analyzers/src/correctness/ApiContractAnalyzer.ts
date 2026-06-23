/**
 * ApiContractAnalyzer — detect API route changes without corresponding client/usage updates
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';

const API_ROUTE_PATTERNS = [
  /\/api\//,
  /handler\.ts$/,
  /route\.ts$/,
  /endpoint\.ts$/,
];

const CLIENT_PATTERNS = [
  /\/client\//,
  /\/services\//,
  /\/hooks\//,
  /\/api[-_]?client\//,
  /\/fetch\//,
];

function isApiRouteFile(path: string): boolean {
  const lower = path.toLowerCase();
  return API_ROUTE_PATTERNS.some((p) => p.test(lower));
}

function isClientFile(path: string): boolean {
  const lower = path.toLowerCase();
  return CLIENT_PATTERNS.some((p) => p.test(lower));
}

function extractApiPath(filePath: string): string | null {
  // e.g., "src/api/users/route.ts" -> "/api/users"
  const match = filePath.match(/\/api\/([^/]+)/);
  if (match) {
    return `/api/${match[1]}`;
  }
  return null;
}

function hasBreakingChange(hunkLines: string[]): boolean {
  // Check for method changes (GET -> POST, etc.) or required param additions
  const methodChangePattern = /\b(GET|POST|PUT|PATCH|DELETE)\s*(?:→|->|=>)\s*(GET|POST|PUT|PATCH|DELETE)/i;
  const requiredParamPattern = /param\??:\s*\w+/;

  for (const line of hunkLines) {
    if (methodChangePattern.test(line)) return true;
  }
  return false;
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const ApiContractAnalyzer: DiffScopedAnalyzer = {
  id: 'api-contract',
  name: 'API Contract Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    // Find changed API route files
    const apiRouteFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isApiRouteFile(f.path)
    );

    if (apiRouteFiles.length === 0) {
      return { findings };
    }

    // For each API route, check if client callers were also updated
    for (const apiFile of apiRouteFiles) {
      const apiPath = extractApiPath(apiFile.path);
      if (!apiPath) continue;

      const changeType = apiFile.changeType as DiffScopedFinding['introducedBy'];

      // Get hunks for this file
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === apiFile.path);
      const addedLines = fileHunks.flatMap((h) =>
        h.lines.filter((l) => l.type === 'added').map((l) => l.content)
      );

      const isBreaking = hasBreakingChange(addedLines);

      // Check if any client files reference this API and were changed
      const clientFilesChanged = ctx.diffResult.files.some(
        (f) => !f.binary && isClientFile(f.path)
      );

      // Check if the API path is referenced in other changed files
      const apiReferencedInDiff = ctx.diffResult.files.some((f) => {
        if (f.path === apiFile.path) return false;
        if (f.binary) return false;
        // Get content from hunks
        const hunks = ctx.diffResult.hunks.filter((h) => h.filePath === f.path);
        return hunks.some((h) =>
          h.lines.some((l) => l.content.includes(apiPath))
        );
      });

      // If API changed but no client reference in diff and no client files changed
      if (!apiReferencedInDiff && !clientFilesChanged) {
        findings.push({
          id: generateId('api-contract', apiFile.path, 1),
          severity: isBreaking ? 'high' : 'medium',
          category: 'correctness',
          title: isBreaking
            ? `Breaking API change detected without client updates`
            : `API route changed without corresponding client updates`,
          explanation: `The API route "${apiPath}" was ${changeType} but no client-side callers (in client/, services/, or hooks/) appear to have been updated. Ensure the API contract is still satisfied by existing callers, or update them accordingly.`,
          file: apiFile.path,
          introducedBy: changeType,
          pattern: `api-route:${apiPath}`,
          confidence: isBreaking ? 90 : 75,
        });
      }
    }

    return { findings };
  },
};