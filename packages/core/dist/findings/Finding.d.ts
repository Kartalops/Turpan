/**
 * Finding — structured, evidence-backed review issue
 * Every Finding MUST have evidence. Vague assertions are not Findings.
 */
import type { Evidence } from './Evidence.js';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category = 'project' | 'build' | 'test' | 'lint' | 'typecheck' | 'security' | 'ui' | 'accessibility' | 'performance' | 'architecture' | 'dead-code' | 'dependency' | 'agent-output' | 'maintainability' | 'runtime' | 'api-design' | 'error-boundary' | 'config' | 'unknown-project';
/** Confidence that this Finding is a real issue (0–100) */
export type Confidence = number & {
    readonly brand: unique symbol;
};
export declare function confidence(n: number): Confidence;
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
export declare function createFinding(partial: Partial<Finding> & {
    title: string;
    explanation: string;
    category: Category;
    severity: Severity;
}): Finding;
/** Create a placeholder Finding — used before real analysis is implemented */
export declare function createPlaceholderFinding(title: string, explanation: string, category?: Category): Finding;
//# sourceMappingURL=Finding.d.ts.map