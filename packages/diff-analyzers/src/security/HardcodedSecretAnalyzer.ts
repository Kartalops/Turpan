/**
 * HardcodedSecretAnalyzer — detects hardcoded secrets in diff hunks
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk, DiffLine } from '@turpan/git-diff';

// Patterns for detecting hardcoded secrets
const PATTERNS = {
  // Generic hardcoded secret pattern
  genericSecret: /(?:password|passwd|pass|pwd|secret|token|api_?key|credential|auth|private)[_-]?(?:key|id|token|secret)?["\s]*[=:]["'\s]*["'][A-Za-z0-9+/=_\-]{8,}["']/gi,

  // AWS access key ID
  awsKey: /AKIA[0-9A-Z]{16}/g,

  // Generic long secret-like string (32+ chars)
  longSecret: /["'][A-Za-z0-9+/=_\-]{32,}["']/g,

  // API key name patterns (high confidence when followed by = or :)
  apiKeyNames: /\b(api_key|apiKey|API_KEY|apikey|api-key|api_secret|apiSecret|API_SECRET|secret_key|SECRET_KEY|secretKey|private_key|PRIVATE_KEY|privatekey|priv_key)\b/gi,

  // Password name patterns
  passwordNames: /\b(password|PASSWORD|passwd|pass|pwd|credential|CREDENTIALS|credentials)\b/gi,

  // Token name patterns
  tokenNames: /\b(token|TOKEN|auth_token|AUTH_TOKEN|access_token|ACCESS_TOKEN|bearer_token|BEARER)\b/gi,

  // Connection string patterns
  connectionStrings: /\bConnection String|connection_string|CONNECTION_STRING\b/gi,
};

// Files/paths to skip entirely
const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function getAddedLines(hunk: DiffHunk): Array<{ line: DiffLine; lineNum: number }> {
  return hunk.lines
    .filter((l) => l.type === 'added')
    .map((l) => ({
      line: l,
      lineNum: l.newLineNumber ?? 0,
    }));
}

function generateId(analyzerId: string, filePath: string, line: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${line}`;
}

function checkLineForSecrets(
  content: string,
  filePath: string,
  hunk: DiffHunk,
  changeType: 'added' | 'modified' | 'deleted' | 'renamed',
  projectRoot: string
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  // Check AWS keys
  let match: RegExpExecArray | null;
  const awsRe = new RegExp(PATTERNS.awsKey.source, 'g');
  while ((match = awsRe.exec(content)) !== null) {
    findings.push({
      id: generateId('hardcoded-secret', filePath, match.index),
      severity: 'critical',
      category: 'security',
      title: 'Hardcoded AWS Access Key ID detected',
      explanation: `A potential AWS access key ID (AKIA...) was detected in ${changeType} code. AWS keys must never be committed. Rotate the key immediately and use environment variables or a secrets manager.`,
      file: filePath,
      line: match.index,
      diffLines: hunk.lines
        .filter((l) => l.type === 'added')
        .map((l) => ({
          lineNum: l.newLineNumber ?? 0,
          content: l.content,
          type: l.type,
        })),
      introducedBy: changeType,
      pattern: match[0],
      confidence: 90,
    });
  }

  // Check generic secrets (password=, token=, etc.)
  const genericRe = new RegExp(PATTERNS.genericSecret.source, 'g');
  while ((match = genericRe.exec(content)) !== null) {
    findings.push({
      id: generateId('hardcoded-secret', filePath, match.index),
      severity: 'critical',
      category: 'security',
      title: 'Hardcoded secret detected',
      explanation: `A hardcoded secret pattern (${match[0].slice(0, 20)}...) was detected. Secrets should never be committed to source control. Use environment variables or a secrets manager instead.`,
      file: filePath,
      line: match.index,
      diffLines: hunk.lines
        .filter((l) => l.type === 'added')
        .map((l) => ({
          lineNum: l.newLineNumber ?? 0,
          content: l.content,
          type: l.type,
        })),
      introducedBy: changeType,
      pattern: match[0],
      confidence: 90,
    });
  }

  // Check for long secret-like strings (heuristic)
  const longSecretRe = new RegExp(PATTERNS.longSecret.source, 'g');
  while ((match = longSecretRe.exec(content)) !== null) {
    // Skip if it looks like a hash or common non-secret value
    const val = match[0].slice(1, -1);
    if (/^[A-Fa-f0-9]{32,}$/.test(val)) continue; // Looks like a hash
    if (/^(?:true|false|null|undefined)$/.test(val)) continue;

    findings.push({
      id: generateId('hardcoded-secret', filePath, match.index),
      severity: 'critical',
      category: 'security',
      title: 'Potential hardcoded secret detected',
      explanation: `A long base64-like or encoded string was detected which may be a secret. Review and replace with a reference to a secrets manager if confirmed.`,
      file: filePath,
      line: match.index,
      diffLines: hunk.lines
        .filter((l) => l.type === 'added')
        .map((l) => ({
          lineNum: l.newLineNumber ?? 0,
          content: l.content,
          type: l.type,
        })),
      introducedBy: changeType,
      pattern: match[0],
      confidence: 70,
    });
  }

  return findings;
}

export const HardcodedSecretAnalyzer: DiffScopedAnalyzer = {
  id: 'hardcoded-secret',
  name: 'Hardcoded Secret Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];

      // Get hunks for this file
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const addedLines = getAddedLines(hunk);
        for (const { line, lineNum } of addedLines) {
          const lineFindings = checkLineForSecrets(
            line.content,
            file.path,
            hunk,
            changeType,
            ctx.projectRoot
          );
          findings.push(...lineFindings);
        }
      }
    }

    return { findings };
  },
};