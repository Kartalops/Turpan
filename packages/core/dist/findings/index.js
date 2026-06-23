// Findings — structured evidence-backed review issues
export * from './Evidence.js';
export * from './Finding.js';
export * from './FindingStore.js';
export * from './severity.js';
export * from './score.js';
export * from './formatFinding.js';
// Legacy helpers — kept for backwards compat with existing orchestrator/reports
export function createPlaceholderFinding(type, title, description) {
    return {
        id: `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        severity: 'info',
        title,
        description,
        fixAvailable: false,
    };
}
export function createPlaceholderFindings() {
    return [
        createPlaceholderFinding('other', 'Placeholder: Analysis not yet implemented', 'This is a placeholder finding. Real analysis will be implemented in a future phase.'),
    ];
}
export function countFindingsBySeverity(findings) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings)
        counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
}
export function countFindingsByType(findings) {
    const counts = {};
    for (const f of findings)
        counts[f.type] = (counts[f.type] ?? 0) + 1;
    return counts;
}
//# sourceMappingURL=index.js.map