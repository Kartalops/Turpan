/**
 * MCP resource URI schemas.
 *
 * URI patterns:
 *   turpan://runs/latest/TURPAN_ANALYSIS.md
 *   turpan://runs/latest/TURPAN_FINDINGS.json
 *   turpan://runs/latest/TURPAN_SCORECARD.json
 *   turpan://runs/latest/screenshots/
 *   turpan://runs/latest/logs/
 *   turpan://runs/latest/TURPAN_PATCH.diff
 *   turpan://runs/<runId>/TURPAN_ANALYSIS.md
 */

export type TurpanResourceName =
  | 'TURPAN_ANALYSIS.md'
  | 'TURPAN_FINDINGS.json'
  | 'TURPAN_SCORECARD.json'
  | 'TURPAN_PATCH.diff'
  | 'screenshots'
  | 'logs'
  | 'TURPAN_RUN_SUMMARY.json'
  | 'project-fingerprint.json';

export interface TurpanResourceUri {
  runId: 'latest' | string;
  filename: TurpanResourceName;
}

export function parseTurpanUri(uri: string): TurpanResourceUri | null {
  // Pattern: turpan://runs/{runId}/{filename}
  const match = uri.match(/^turpan:\/\/runs\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { runId: match[1], filename: match[2] as TurpanResourceName };
}

export function buildTurpanUri(runId: string, filename: TurpanResourceName): string {
  return `turpan://runs/${runId}/${filename}`;
}

export const ALLOWED_RESOURCES: Record<TurpanResourceName, { mimeType: string; description: string }> = {
  'TURPAN_ANALYSIS.md':   { mimeType: 'text/markdown',  description: 'Human-readable analysis report' },
  'TURPAN_FINDINGS.json': { mimeType: 'application/json', description: 'Structured findings list' },
  'TURPAN_SCORECARD.json': { mimeType: 'application/json', description: 'Quality scorecard' },
  'TURPAN_PATCH.diff':    { mimeType: 'text/plain',      description: 'Unified diff for all auto-safe fixes' },
  'screenshots':          { mimeType: 'application/octet-stream', description: 'UI test screenshots directory' },
  'logs':                 { mimeType: 'application/octet-stream', description: 'Run logs directory' },
  'TURPAN_RUN_SUMMARY.json': { mimeType: 'application/json', description: 'Run metadata summary' },
  'project-fingerprint.json': { mimeType: 'application/json', description: 'Project fingerprint data' },
};

export function isAllowedResource(filename: string): filename is TurpanResourceName {
  return filename in ALLOWED_RESOURCES;
}