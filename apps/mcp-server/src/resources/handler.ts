/**
 * MCP Resource handlers — serve Turpan run artifacts via turpan:// URIs.
 *
 * Read-only access to:
 *   turpan://runs/latest/TURPAN_ANALYSIS.md
 *   turpan://runs/latest/TURPAN_FINDINGS.json
 *   turpan://runs/latest/TURPAN_SCORECARD.json
 *   turpan://runs/latest/TURPAN_PATCH.diff
 *   turpan://runs/latest/screenshots/
 *   turpan://runs/latest/logs/
 *   turpan://runs/<runId>/...
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';

import { parseTurpanUri, buildTurpanUri, ALLOWED_RESOURCES, isAllowedResource } from '../schemas/resources.js';
import { validateProjectPath, validateRunId, getLatestRunPath } from '../security/workspace.js';
import { redactObject } from '../security/redact.js';

export const TURPAN_PROTOCOL = 'turpan';

/**
 * List all Turpan run resources available as MCP resources.
 */
export function listTurpanResources(projectPath: string, runId?: string): Resource[] {
  const resources: Resource[] = [];

  try {
    validateProjectPath(projectPath);
  } catch {
    return resources;
  }

  let targetRunId: string;
  if (runId) {
    try { validateRunId(runId); } catch { return resources; }
    targetRunId = runId;
  } else {
    const latest = getLatestRunPath(projectPath);
    if (!latest) return resources;
    targetRunId = latest.split('/').pop() ?? 'latest';
  }

  const runDir = join(projectPath, '.turpan', 'runs', targetRunId);

  for (const [filename, info] of Object.entries(ALLOWED_RESOURCES)) {
    const filePath = join(runDir, filename);
    if (existsSync(filePath)) {
      resources.push({
        uri: buildTurpanUri(targetRunId, filename as keyof typeof ALLOWED_RESOURCES),
        name: `${filename} (${targetRunId})`,
        description: info.description,
        mimeType: info.mimeType,
      });
    }
  }

  return resources;
}

/**
 * Read the content of a turpan:// resource URI.
 */
export function readTurpanResource(projectPath: string, uri: string): { content: string; mimeType: string } | null {
  const parsed = parseTurpanUri(uri);
  if (!parsed) return null;

  try {
    validateProjectPath(projectPath);
  } catch {
    return null;
  }

  if (!isAllowedResource(parsed.filename)) return null;

  let targetRunId = parsed.runId;
  if (targetRunId === 'latest') {
    const latest = getLatestRunPath(projectPath);
    if (!latest) return null;
    targetRunId = latest.split('/').pop() ?? 'latest';
  } else {
    try { validateRunId(targetRunId); } catch { return null; }
  }

  const filePath = join(projectPath, '.turpan', 'runs', targetRunId, parsed.filename);

  if (!existsSync(filePath)) return null;

  // For directory-like resources (screenshots, logs), list files instead of reading
  if (parsed.filename === 'screenshots' || parsed.filename === 'logs') {
    try {
      const files = readdirSync(filePath);
      return {
        content: JSON.stringify({ files, count: files.length }, null, 2),
        mimeType: 'application/json',
      };
    } catch {
      return null;
    }
  }

  const content = readFileSync(filePath, 'utf-8');
  const info = ALLOWED_RESOURCES[parsed.filename as keyof typeof ALLOWED_RESOURCES];

  // Redact any secrets before serving
  if (parsed.filename.endsWith('.json')) {
    try {
      const redacted = redactObject(JSON.parse(content));
      return { content: JSON.stringify(redacted, null, 2), mimeType: info.mimeType };
    } catch {
      return { content, mimeType: info.mimeType };
    }
  }

  return { content, mimeType: info.mimeType };
}

/**
 * Get the list of available screenshots in a run.
 */
export function listScreenshots(projectPath: string, runId?: string): string[] {
  try {
    validateProjectPath(projectPath);
  } catch {
    return [];
  }

  let targetRunId: string;
  if (runId) {
    try { validateRunId(runId); } catch { return []; }
    targetRunId = runId;
  } else {
    const latest = getLatestRunPath(projectPath);
    if (!latest) return [];
    targetRunId = latest.split('/').pop() ?? 'latest';
  }

  const screenshotsDir = join(projectPath, '.turpan', 'runs', targetRunId, 'screenshots');
  if (!existsSync(screenshotsDir)) return [];
  try {
    return readdirSync(screenshotsDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
  } catch {
    return [];
  }
}