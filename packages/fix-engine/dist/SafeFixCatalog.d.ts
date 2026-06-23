/**
 * SafeFixCatalog — maps Finding types/categories/tags to specific fix strategies.
 *
 * Safe fixes: low-risk, reversible, compiler/linter confirmed.
 * Unsafe fixes: never auto-apply; require explicit human approval.
 */
import type { Finding } from '@turpan/core';
import type { FixCategory, ValidationCheck } from './types.js';
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
/**
 * Look up a fix strategy for a given finding.
 * Returns null if no strategy applies.
 */
export declare function lookupStrategy(finding: Finding): FixStrategy | null;
/**
 * Is the finding theoretically fixable (any strategy exists)?
 */
export declare function isFixable(finding: Finding): boolean;
/**
 * Return all fixable findings from a list.
 */
export declare function filterFixable(findings: Finding[]): Finding[];
/**
 * Get all available safe fix strategies (for documentation/debugging).
 */
export declare function getSafeStrategies(): FixStrategy[];
/**
 * Get all unsafe categories that should never be auto-applied.
 */
export declare const UNSAFE_FIX_CATEGORIES: FixCategory[];
//# sourceMappingURL=SafeFixCatalog.d.ts.map