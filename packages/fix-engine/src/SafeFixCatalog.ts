/**
 * SafeFixCatalog — maps Finding types/categories/tags to specific fix strategies.
 *
 * Safe fixes: low-risk, reversible, compiler/linter confirmed.
 * Unsafe fixes: never auto-apply; require explicit human approval.
 */

import type { Finding, Category } from '@turpan/core';
import type { FixCategory, FixCandidate, ValidationCheck } from './types.js';

// ─── Fix Strategy ────────────────────────────────────────────────────────────

export interface FixStrategy {
  /** Human-readable label */
  label: string;
  /** Category classification */
  category: FixCategory;
  /** Auto-apply in auto-safe mode */
  autoSafe: boolean;
  /** Risk level of this fix */
  risk: 'critical' | 'high' | 'medium' | 'low';
  /** Minimum confidence required (0–100) */
  minConfidence: number;
  /** What validation checks are required after this fix */
  requiredChecks: ValidationCheck[];
  /** Whether the fix is reversible */
  reversible: boolean;
  /** Generate the replacement snippet */
  generate: (finding: Finding) => FixReplacement | null;
}

export interface FixReplacement {
  /** Replacement source code snippet */
  snippet: string;
  /** Start line (1-based); null = insert at beginning */
  startLine: number;
  /** End line (1-based); null = single-line or insert */
  endLine: number;
  /** Hunk header for diff */
  hunkHeader?: string;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

type StrategyMatcher = (f: Finding) => boolean;

function and(...matchers: StrategyMatcher[]): StrategyMatcher {
  return f => matchers.every(m => m(f));
}

function or(...matchers: StrategyMatcher[]): StrategyMatcher {
  return f => matchers.some(m => m(f));
}

function tagIncludes(tag: string): StrategyMatcher {
  return f => f.tags?.includes(tag) ?? false;
}

function categoryIs(cat: Category): StrategyMatcher {
  return f => f.category === cat;
}

function severityAtMost(max: 'critical' | 'high' | 'medium' | 'low'): StrategyMatcher {
  const order = ['critical', 'high', 'medium', 'low'];
  const maxIdx = order.indexOf(max);
  return f => order.indexOf(f.severity) <= maxIdx;
}

function hasFile(): StrategyMatcher {
  return f => !!f.file;
}

// ─── Strategy Implementations ─────────────────────────────────────────────────

function removeUnusedImport(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  // The finding's evidence should contain the unused import text
  const importEvidence = finding.evidence[0];
  const importSnippet = importEvidence?.excerpt ?? importEvidence?.label ?? '';
  return {
    snippet: '',
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} +0,0 @@`,
  };
}

function removeConsoleLog(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  return {
    snippet: '',
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} +0,0 @@`,
  };
}

function removeDebugger(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  return {
    snippet: '',
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} +0,0 @@`,
  };
}

function removeUnusedVariable(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  return {
    snippet: '',
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} +0,0 @@`,
  };
}

function addNullGuard(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  // Only handle minimal, obvious null guards
  const suggestedFix = finding.suggestedFix ?? '';
  if (!suggestedFix.includes('null') && !suggestedFix.includes('undefined')) return null;
  return {
    snippet: suggestedFix,
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line + 1} @@`,
  };
}

function fixBrokenImport(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  const suggestedFix = finding.suggestedFix ?? '';
  if (!suggestedFix) return null;
  return {
    snippet: suggestedFix,
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} @@`,
  };
}

function removeUnusedFile(finding: Finding): FixReplacement | null {
  // Destructive — only in patch-only mode, high confidence required
  const { file } = finding;
  if (!file) return null;
  return {
    snippet: '',
    startLine: 1,
    endLine: 999999, // delete entire file marker
    hunkHeader: `@@ -1,999999 +0,0 @@ delete ${file}`,
  };
}

function replacePlaceholderTodo(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  const suggestedFix = finding.suggestedFix ?? '';
  if (!suggestedFix) return null;
  return {
    snippet: suggestedFix,
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} @@`,
  };
}

function applyLintAutofix(finding: Finding): FixReplacement | null {
  const { file, line } = finding;
  if (!file || !line) return null;
  const suggestedFix = finding.suggestedFix ?? '';
  if (!suggestedFix) return null;
  return {
    snippet: suggestedFix,
    startLine: line,
    endLine: line,
    hunkHeader: `@@ -${line},${line} @@`,
  };
}

function suggestMissingScript(finding: Finding): FixReplacement | null {
  // Does not modify code — only reports
  return null;
}

// ─── Catalog Registry ─────────────────────────────────────────────────────────

const STRATEGIES: Array<{ matcher: StrategyMatcher; strategy: FixStrategy }> = [
  // ── SAFE ────────────────────────────────────────────────────────────────

  // 1. Remove unused imports
  {
    matcher: and(
      categoryIs('dead-code'),
      tagIncludes('unused-import'),
      hasFile(),
    ),
    strategy: {
      label: 'Remove unused import',
      category: 'safe',
      autoSafe: true,
      risk: 'low',
      minConfidence: 80,
      requiredChecks: ['typecheck', 'lint'],
      reversible: true,
      generate: removeUnusedImport,
    },
  },

  // 2. Remove console.log / debug statements
  {
    matcher: or(
      and(categoryIs('maintainability'), tagIncludes('console-log')),
      and(categoryIs('maintainability'), tagIncludes('debug-code')),
      and(categoryIs('dead-code'), tagIncludes('console')),
    ),
    strategy: {
      label: 'Remove console.log / debugger',
      category: 'safe',
      autoSafe: true,
      risk: 'low',
      minConfidence: 90,
      requiredChecks: ['lint'],
      reversible: true,
      generate: (f) => {
        if (f.tags?.includes('debugger')) return removeDebugger(f);
        return removeConsoleLog(f);
      },
    },
  },

  // 3. Remove debugger
  {
    matcher: and(categoryIs('dead-code'), tagIncludes('debugger')),
    strategy: {
      label: 'Remove debugger statement',
      category: 'safe',
      autoSafe: true,
      risk: 'low',
      minConfidence: 95,
      requiredChecks: ['lint'],
      reversible: true,
      generate: removeDebugger,
    },
  },

  // 4. Apply lint autofix
  {
    matcher: and(
      categoryIs('lint'),
      (f) => f.suggestedFix !== undefined && f.suggestedFix.length > 0,
      hasFile(),
    ),
    strategy: {
      label: 'Apply lint autofix',
      category: 'safe',
      autoSafe: true,
      risk: 'medium',
      minConfidence: 70,
      requiredChecks: ['lint', 'typecheck'],
      reversible: true,
      generate: applyLintAutofix,
    },
  },

  // 5. Remove unused variable (only when compiler confirms)
  {
    matcher: and(
      categoryIs('dead-code'),
      tagIncludes('unused-variable'),
      hasFile(),
    ),
    strategy: {
      label: 'Remove unused variable',
      category: 'safe',
      autoSafe: true,
      risk: 'medium',
      minConfidence: 85,
      requiredChecks: ['typecheck'],
      reversible: true,
      generate: removeUnusedVariable,
    },
  },

  // 6. Add null guard for clear runtime error
  {
    matcher: and(
      categoryIs('runtime'),
      severityAtMost('medium'),
      (f) => f.confidence >= 85,
      (f) => !!f.suggestedFix,
      hasFile(),
    ),
    strategy: {
      label: 'Add null guard',
      category: 'safe',
      autoSafe: true,
      risk: 'medium',
      minConfidence: 85,
      requiredChecks: ['typecheck', 'test'],
      reversible: true,
      generate: addNullGuard,
    },
  },

  // 7. Fix broken relative import (error output clearly identifies it)
  {
    matcher: and(
      categoryIs('build'),
      tagIncludes('broken-import'),
      (f) => f.confidence >= 80,
      (f) => !!f.suggestedFix,
      hasFile(),
    ),
    strategy: {
      label: 'Fix broken relative import',
      category: 'safe',
      autoSafe: true,
      risk: 'medium',
      minConfidence: 80,
      requiredChecks: ['typecheck', 'build'],
      reversible: true,
      generate: fixBrokenImport,
    },
  },

  // ── MANUAL ──────────────────────────────────────────────────────────────

  // 8. Remove unused dependency (only in patch-only)
  {
    matcher: and(
      categoryIs('dependency'),
      tagIncludes('unused-dependency'),
      hasFile(),
    ),
    strategy: {
      label: 'Remove unused dependency',
      category: 'manual',
      autoSafe: false,
      risk: 'high',
      minConfidence: 70,
      requiredChecks: ['build', 'test'],
      reversible: false,
      generate: removeUnusedImport,
    },
  },

  // 9. Delete unused file (only patch-only, high confidence)
  {
    matcher: and(
      categoryIs('dead-code'),
      tagIncludes('unused-file'),
      (f) => f.confidence >= 90,
      hasFile(),
    ),
    strategy: {
      label: 'Delete unused file',
      category: 'manual',
      autoSafe: false,
      risk: 'high',
      minConfidence: 90,
      requiredChecks: ['build', 'test'],
      reversible: false,
      generate: removeUnusedFile,
    },
  },

  // 10. Replace placeholder TODO (only obvious and local)
  {
    matcher: and(
      categoryIs('maintainability'),
      tagIncludes('placeholder-todo'),
      (f) => f.confidence >= 85,
      (f) => !!f.suggestedFix,
      hasFile(),
    ),
    strategy: {
      label: 'Replace placeholder TODO',
      category: 'manual',
      autoSafe: false,
      risk: 'medium',
      minConfidence: 85,
      requiredChecks: ['lint', 'typecheck'],
      reversible: true,
      generate: replacePlaceholderTodo,
    },
  },

  // 11. Suggest missing test script (report only)
  {
    matcher: and(
      categoryIs('project'),
      tagIncludes('missing-script'),
    ),
    strategy: {
      label: 'Suggest missing test script',
      category: 'manual',
      autoSafe: false,
      risk: 'low',
      minConfidence: 50,
      requiredChecks: [],
      reversible: true,
      generate: suggestMissingScript,
    },
  },
];

// ─── Catalog API ─────────────────────────────────────────────────────────────

/**
 * Look up a fix strategy for a given finding.
 * Returns null if no strategy applies.
 */
export function lookupStrategy(finding: Finding): FixStrategy | null {
  for (const { matcher, strategy } of STRATEGIES) {
    if (matcher(finding)) return strategy;
  }
  return null;
}

/**
 * Is the finding theoretically fixable (any strategy exists)?
 */
export function isFixable(finding: Finding): boolean {
  return lookupStrategy(finding) !== null;
}

/**
 * Return all fixable findings from a list.
 */
export function filterFixable(findings: Finding[]): Finding[] {
  return findings.filter(isFixable);
}

/**
 * Get all available safe fix strategies (for documentation/debugging).
 */
export function getSafeStrategies(): FixStrategy[] {
  return STRATEGIES.filter(s => s.strategy.autoSafe).map(s => s.strategy);
}

/**
 * Get all unsafe categories that should never be auto-applied.
 */
export const UNSAFE_FIX_CATEGORIES: FixCategory[] = ['unsafe'];
