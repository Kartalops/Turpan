/**
 * EnvConfigAnalyzer — detect env requirement changes without config/docs update
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';

const ENV_FILE_PATTERNS = [
  /\.env/,
  /environment\.ts$/,
  /config\.ts$/,
  /constants\.ts$/,
  /config$/,
];

const ENV_VAR_PATTERN = /process\.env\.(\w+)/g;

function isEnvFile(path: string): boolean {
  const lower = path.toLowerCase();
  return ENV_FILE_PATTERNS.some((p) => p.test(lower));
}

function isEnvExampleFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('.env.example') || lower.includes('.env.local') || lower.includes('.env.development');
}

function extractEnvVars(lines: string[]): { name: string; isRequired: boolean }[] {
  const vars: { name: string; isRequired: boolean }[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Skip comments and empty lines
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    // Match process.env.X patterns
    let match;
    const re = new RegExp(ENV_VAR_PATTERN.source, 'g');
    while ((match = re.exec(line)) !== null) {
      const varName = match[1]!;
      if (seen.has(varName)) continue;
      seen.add(varName);

      // Check if it looks required (not using || or ?? for defaults)
      const isRequired = !/\|\||\?\?/.test(line.slice(match.index, match.index + 50));

      vars.push({ name: varName, isRequired });
    }
  }

  return vars;
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const EnvConfigAnalyzer: DiffScopedAnalyzer = {
  id: 'env-config',
  name: 'Environment Config Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    // Find changed env/config files
    const envFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isEnvFile(f.path)
    );

    if (envFiles.length === 0) {
      return { findings };
    }

    // Check if .env.example was also changed
    const envExampleChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isEnvExampleFile(f.path)
    );

    for (const envFile of envFiles) {
      // Skip .env.example files themselves
      if (isEnvExampleFile(envFile.path)) continue;

      const changeType = envFile.changeType as DiffScopedFinding['introducedBy'];

      // Get hunks for this file
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === envFile.path);
      const addedLines = fileHunks.flatMap((h) =>
        h.lines.filter((l) => l.type === 'added').map((l) => l.content)
      );

      if (addedLines.length === 0) continue;

      const envVars = extractEnvVars(addedLines);
      const requiredVars = envVars.filter((v) => v.isRequired);

      if (requiredVars.length > 0 && !envExampleChanged) {
        findings.push({
          id: generateId('env-config', envFile.path, requiredVars.length),
          severity: 'medium',
          category: 'correctness',
          title: `New required env var(s) added without .env.example update`,
          explanation: `The following required environment variables were added: ${requiredVars.map((v) => v.name).join(', ')}. Please update .env.example to document these.`,
          file: envFile.path,
          introducedBy: changeType,
          pattern: `env-var:${requiredVars.map((v) => v.name).join(',')}`,
          confidence: 80,
        });
      }
    }

    return { findings };
  },
};