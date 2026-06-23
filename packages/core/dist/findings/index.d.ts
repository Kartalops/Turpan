export * from './Evidence.js';
export * from './Finding.js';
export * from './FindingStore.js';
export * from './severity.js';
export * from './score.js';
export * from './formatFinding.js';
export declare function createPlaceholderFinding(type: string, title: string, description: string): {
    id: string;
    type: string;
    severity: "info";
    title: string;
    description: string;
    fixAvailable: boolean;
};
export declare function createPlaceholderFindings(): {
    id: string;
    type: string;
    severity: "info";
    title: string;
    description: string;
    fixAvailable: boolean;
}[];
export declare function countFindingsBySeverity(findings: Array<{
    severity: string;
}>): Record<string, number>;
export declare function countFindingsByType(findings: Array<{
    type: string;
}>): Record<string, number>;
//# sourceMappingURL=index.d.ts.map