/**
 * FindingStore — in-memory store for all findings collected during a review run
 */
import type { Finding, Severity, Category } from './Finding.js';
export declare class FindingStore {
    private _findings;
    add(finding: Finding): void;
    addMany(findings: Finding[]): void;
    get all(): readonly Finding[];
    get count(): number;
    clear(): void;
    /** Filter by severity */
    withSeverity(severity: Severity): Finding[];
    /** Filter by category */
    withCategory(category: Category): Finding[];
    /** Filter to only fixable findings */
    fixable(): Finding[];
    /** Filter to findings above a minimum confidence */
    withMinConfidence(min: number): Finding[];
    /** Filter by file */
    withFile(file: string): Finding[];
    /** Sort by severity desc, then confidence desc */
    sortedBySeverity(): Finding[];
    /** Group by category */
    byCategory(): Map<Category, Finding[]>;
    /** Group by severity */
    bySeverity(): Map<Severity, Finding[]>;
    /** Returns all unique files that have findings */
    affectedFiles(): string[];
    toJSON(): Finding[];
}
//# sourceMappingURL=FindingStore.d.ts.map