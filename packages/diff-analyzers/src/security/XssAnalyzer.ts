/**
 * XssAnalyzer — detects XSS sink introduction in diffs
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';
import type { DiffHunk } from '@turpan/git-diff';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
];

// Dangerous XSS sink patterns
const XSS_SINK_PATTERNS = [
  {
    pattern: /dangerouslySetInnerHTML/i,
    sink: 'dangerouslySetInnerHTML',
    confidence: 90,
  },
  {
    pattern: /\.innerHTML\s*=/i,
    sink: 'innerHTML assignment',
    confidence: 90,
  },
  {
    pattern: /\.outerHTML\s*=/i,
    sink: 'outerHTML assignment',
    confidence: 90,
  },
  {
    pattern: /\beval\s*\(/i,
    sink: 'eval()',
    confidence: 90,
  },
  {
    pattern: /\bnew\s+Function\s*\(/i,
    sink: 'new Function()',
    confidence: 85,
  },
  {
    pattern: /document\.write\s*\(/i,
    sink: 'document.write()',
    confidence: 90,
  },
  {
    pattern: /document\.writeln\s*\(/i,
    sink: 'document.writeln()',
    confidence: 90,
  },
  {
    pattern: /\{\{.*?\}\}/g, // React/Svelte template injection style
    sink: 'double-brace template binding',
    confidence: 70,
  },
];

// jQuery methods that can be XSS sinks
const JQUERY_XSS_PATTERNS = [/\.html\s*\(/i, /\.append\s*\(/i, /\.wrap\s*\(/i, /\.prepend\s*\(/i];

// User input sources
const USER_INPUT_PATTERNS = [
  /\breq\.(params|query|body|headers)/i,
  /\brequest\.(params|query|body|headers)/i,
  /\bctx\.request\./i,
  /\bevent\.path\b/i,
  /\bparams\./i,
  /\bquery\./i,
  /\bbody\./i,
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function containsUserInput(content: string): boolean {
  return USER_INPUT_PATTERNS.some((p) => p.test(content));
}

function detectXss(
  hunk: DiffHunk,
  filePath: string,
  changeType: DiffScopedFinding['introducedBy']
): DiffScopedFinding[] {
  const findings: DiffScopedFinding[] = [];

  for (const line of hunk.lines) {
    if (line.type !== 'added') continue;
    const content = line.content;

    // Check standard XSS sink patterns
    for (const { pattern, sink, confidence } of XSS_SINK_PATTERNS) {
      if (pattern.test(content)) {
        const hasUserInput = containsUserInput(content);

        findings.push({
          id: `xss-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: hasUserInput ? 'high' : 'medium',
          category: 'security',
          title: `XSS sink introduced: ${sink}`,
          explanation: hasUserInput
            ? `A potential XSS sink (${sink}) was detected with user input flowing into it. This can enable cross-site scripting attacks. Ensure proper sanitization/encoding.`
            : `An XSS sink (${sink}) was detected. Verify that any user input is properly sanitized before being passed here.`,
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
          pattern: String(pattern),
          confidence: hasUserInput ? 90 : confidence,
        });
        break;
      }
    }

    // Check jQuery XSS patterns
    for (const pattern of JQUERY_XSS_PATTERNS) {
      if (pattern.test(content) && containsUserInput(content)) {
        findings.push({
          id: `xss-jquery-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: 'high',
          category: 'security',
          title: 'Potential jQuery XSS sink with user input',
          explanation: `jQuery method (.html(), .append(), etc.) detected with user input. This can enable XSS if user input is not sanitized.`,
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
          pattern: String(pattern),
          confidence: 80,
        });
        break;
      }
    }

    // Check for template injection (double-brace without escaping context)
    const doubleBraceRe = /\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = doubleBraceRe.exec(content)) !== null) {
      // If the content between braces contains something that looks like user input
      const inner = match[1];
      if (USER_INPUT_PATTERNS.some((p) => p.test(inner))) {
        findings.push({
          id: `xss-template-${filePath.split('/').pop()}-${line.newLineNumber ?? 0}`,
          severity: 'high',
          category: 'security',
          title: 'Potential template injection with user input',
          explanation: `A template binding ({{...}}) appears to include user input directly without escaping. This can enable XSS.`,
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
          pattern: match[0],
          confidence: 80,
        });
      }
    }
  }

  return findings;
}

export const XssAnalyzer: DiffScopedAnalyzer = {
  id: 'xss',
  name: 'XSS Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      for (const hunk of fileHunks) {
        const hunkFindings = detectXss(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }

    return { findings };
  },
};