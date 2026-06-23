/**
 * SqlInjectionAnalyzer — detects SQL injection vulnerabilities in diffs
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// SQL keyword patterns that indicate query building
const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i;

// Template literal SQL with interpolation
const TEMPLATE_SQL_INTERPOLATION = /`\s*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION).*\$\{/gi;

// String concatenation SQL
const CONCAT_SQL_PATTERNS = [
  /['"`]\s*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION).*['"`]\s*\+\s*/gi,
  /\+\s*['"`]\s*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION).*['"`]/gi,
  /['"`]\s*SELECT.*['"`]\s*\+\s*\w+/gi,
];

// ORM query method names with template literals
const ORM_QUERY_METHODS = /\.query\s*\(/;
const ORM_FIND_METHODS = /\.(findMany|findFirst|findUnique|create|update|delete|findOne)\s*\(/;

// User-controlled input sources
const USER_INPUT_SOURCES = [
  /\breq\.(params|query|body|headers)/i,
  /\brequest\.(params|query|body|headers)/i,
  /\bctx\.request\./i,
  /\bevent\.path\b/i,
  /\bevent\.query\b/i,
  /\bevent\.body\b/i,
  /\bparams\./i,
  /\bquery\./i,
  /\bbody\./i,
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function containsUserInput(content: string): boolean {
  return USER_INPUT_SOURCES.some((p) => p.test(content));
}

function isParameterized(content: string): boolean {
  // Check for proper parameterization with ? or $1 style placeholders
  return /\?|\$\d+|\$[a-zA-Z_]/.test(content);
}

function detectSqlInjection(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  for (const line of hunk.lines) {
    if (line.type !== 'added') continue;
    const content = line.content;

    // Skip if it looks like a parameterized query
    if (isParameterized(content)) continue;

    // Check for template literal SQL with interpolation
    const templateMatch = TEMPLATE_SQL_INTERPOLATION.exec(content);
    if (templateMatch) {
      findings.push({
        id: `sql-injection-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
        severity: 'high',
        category: 'security',
        title: 'Potential SQL injection via template literal interpolation',
        explanation: `SQL query appears to use template literal string interpolation (${templateMatch[0].slice(0, 30)}...). User input may be directly embedded into SQL queries, enabling SQL injection attacks. Use parameterized queries instead.`,
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
        pattern: 'template-literal-sql',
        confidence: 85,
      });
      TEMPLATE_SQL_INTERPOLATION.lastIndex = 0;
      continue;
    }

    // Check for string concatenation SQL
    for (const pattern of CONCAT_SQL_PATTERNS) {
      if (pattern.test(content)) {
        const hasUserInput = containsUserInput(content);
        findings.push({
          id: `sql-injection-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: hasUserInput ? 'high' : 'medium',
          category: 'security',
          title: hasUserInput
            ? 'Potential SQL injection via string concatenation'
            : 'SQL query built with string concatenation',
          explanation: hasUserInput
            ? `SQL query appears to use string concatenation with user input (${content.slice(0, 40)}...). This is a SQL injection risk. Use parameterized queries instead.`
            : `SQL query appears to be built with string concatenation rather than parameterization. Consider using parameterized queries for safety.`,
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
          pattern: 'string-concat-sql',
          confidence: hasUserInput ? 90 : 70,
        });
        break;
      }
    }

    // Check for ORM query methods with template literals
    if (ORM_QUERY_METHODS.test(content) || ORM_FIND_METHODS.test(content)) {
      // Heuristic: if the line has both an ORM method and user input, flag it
      if (containsUserInput(content) && content.includes('${')) {
        findings.push({
          id: `sql-injection-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: 'high',
          category: 'security',
          title: 'Potential SQL injection in ORM query',
          explanation: `An ORM query method appears to use template interpolation with user input. This can enable SQL injection if the ORM doesn't properly parameterize.`,
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
          pattern: 'orm-template-injection',
          confidence: 80,
        });
      }
    }
  }

  return findings;
}

export const SqlInjectionAnalyzer: DiffScopedAnalyzer = {
  id: 'sql-injection',
  name: 'SQL Injection Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = detectSqlInjection(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};