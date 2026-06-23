/**
 * Format a Finding for display (markdown, JSON, terminal)
 */
import type { Finding, Severity } from './Finding.js';
import type { Evidence } from './Evidence.js';
export interface FormattedFinding {
    id: string;
    title: string;
    severity: Severity;
    severityCode: string;
    category: string;
    file?: string;
    line?: number;
    location: string;
    explanation: string;
    evidenceSummary: string;
    suggestedFix?: string;
    fixable: string;
    confidence: number;
    tags: string[];
}
export declare function formatFindingForDisplay(f: Finding): FormattedFinding;
export declare function formatFindingMarkdown(f: Finding): string;
export declare function formatFindingTableRow(f: Finding): string;
export declare function formatEvidenceItem(e: Evidence, index: number): string;
//# sourceMappingURL=formatFinding.d.ts.map