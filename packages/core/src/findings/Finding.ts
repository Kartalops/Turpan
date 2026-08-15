/**
 * Finding — structured, evidence-backed review issue
 * Every Finding MUST have evidence. Vague assertions are not Findings.
 */

import type { Evidence } from './Evidence.js';
import { createHash } from 'crypto';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Category =
  | 'project'
  | 'build'
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'security'
  | 'ui'
  | 'accessibility'
  | 'performance'
  | 'architecture'
  | 'dead-code'
  | 'dependency'
  | 'agent-output'
  | 'maintainability'
  | 'runtime'
  | 'api-design'
  | 'error-boundary'
  | 'config'
  | 'unknown-project';

/** Confidence that this Finding is a real issue (0–100) */
export type Confidence = number & { readonly brand: unique symbol };
export function confidence(n: number): Confidence {
  return Math.max(0, Math.min(100, Math.round(n))) as Confidence;
}

/** Whether a fix is available (auto or manual) */
export type Fixability = 'auto' | 'manual' | 'none';

export interface Finding {
  /** Stable unique ID (e.g. "fnd-abc123") */
  id: string;
  /** Short one-line title */
  title: string;
  /** Severity level */
  severity: Severity;
  /** Category for grouping */
  category: Category;
  /** Optional file path */
  file?: string;
  /** Optional line number */
  line?: number;
  /** Optional stage/command this came from */
  command?: string;
  /** Detailed explanation — what is the problem and why does it matter? */
  explanation: string;
  /** Evidence items backing this finding */
  evidence: Evidence[];
  /** How to fix — specific step-by-step or reference */
  suggestedFix?: string;
  /** Whether this finding can be fixed */
  fixable: Fixability;
  /** Confidence score 0–100 */
  confidence: Confidence;
  /** Arbitrary tags for filtering */
  tags: string[];
}

function stableFindingSeed(partial: Partial<Finding>): string {
  return JSON.stringify({
    title: partial.title,
    severity: partial.severity,
    category: partial.category,
    file: partial.file,
    line: partial.line,
    command: partial.command,
    explanation: partial.explanation,
    suggestedFix: partial.suggestedFix,
    fixable: partial.fixable,
    tags: partial.tags ?? [],
    evidence: (partial.evidence ?? []).map((item) => ({
      type: item.type,
      label: item.label,
      path: item.path,
      excerpt: item.excerpt,
      url: item.url,
      command: item.command,
      exitCode: item.exitCode,
      value: item.value,
      unit: item.unit,
      metadata: item.metadata,
    })),
  });
}

export function createDeterministicFindingId(partial: Partial<Finding>, prefix = 'fnd'): string {
  const digest = createHash('sha1').update(stableFindingSeed(partial)).digest('hex').slice(0, 12);
  return `${prefix}-${digest}`;
}

export function createFinding(partial: Partial<Finding> & {
  title: string;
  explanation: string;
  category: Category;
  severity: Severity;
}): Finding {
  if (!partial.evidence || partial.evidence.length === 0) {
    throw new Error(`Finding "${partial.title}" has no evidence — every Finding requires evidence`);
  }
  if (!partial.id) partial.id = createDeterministicFindingId(partial);
  if (!partial.tags) partial.tags = [];
  if (!partial.confidence) partial.confidence = confidence(80);
  if (!partial.fixable) partial.fixable = 'none';
  return partial as Finding;
}

/** Create a placeholder Finding — used before real analysis is implemented */
export function createPlaceholderFinding(
  title: string,
  explanation: string,
  category: Category = 'project'
): Finding {
  return createFinding({
    id: createDeterministicFindingId({
      title,
      explanation,
      category,
      severity: 'info',
      evidence: [
        {
          type: 'command-log',
          label: 'placeholder',
          excerpt: 'Placeholder — real evidence not yet collected',
        },
      ],
    }, 'placeholder'),
    title,
    explanation,
    category,
    severity: 'info',
    fixable: 'none',
    confidence: confidence(0),
    evidence: [
      {
        type: 'command-log',
        label: 'placeholder',
        excerpt: 'Placeholder — real evidence not yet collected',
        timestamp: new Date().toISOString(),
      },
    ],
    tags: ['placeholder'],
  });
}
