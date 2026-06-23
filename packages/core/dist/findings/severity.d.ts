/**
 * Severity utilities
 */
import type { Severity } from './Finding.js';
export declare const SEVERITY_ORDER: Severity[];
export declare const SEVERITY_SCORES: Record<Severity, number>;
/** Map severity to a numeric weight for scoring */
export declare function severityWeight(s: Severity): number;
/** Compare two severities — returns negative if a < b */
export declare function severityCmp(a: Severity, b: Severity): number;
/** Return the worst (highest) severity in a list */
export declare function worstSeverity(severities: Severity[]): Severity;
/** Format severity as colored label string */
export declare function formatSeverity(s: Severity): string;
/** Short code for severity (for compact tables) */
export declare function severityCode(s: Severity): string;
/** Long description of what a severity level means */
export declare const SEVERITY_DESCRIPTIONS: Record<Severity, string>;
//# sourceMappingURL=severity.d.ts.map