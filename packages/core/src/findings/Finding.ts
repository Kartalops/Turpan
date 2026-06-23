/**
 * Finding — structured, evidence-backed review issue
 * Every Finding MUST have evidence. Vague assertions are not Findings.
 */

import type { Evidence } from './Evidence.js';

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

let _idCounter = 0;
function genId(prefix = 'fnd'): string {
  return `${prefix}-${Date.now().toString(36)}${(_idCounter++).toString(36)}`;
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
  if (!partial.id) partial.id = genId();
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
    id: genId('placeholder'),
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
