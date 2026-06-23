/**
 * Finding — structured, evidence-backed review issue
 * Every Finding MUST have evidence. Vague assertions are not Findings.
 */
export function confidence(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
}
let _idCounter = 0;
function genId(prefix = 'fnd') {
    return `${prefix}-${Date.now().toString(36)}${(_idCounter++).toString(36)}`;
}
export function createFinding(partial) {
    if (!partial.evidence || partial.evidence.length === 0) {
        throw new Error(`Finding "${partial.title}" has no evidence — every Finding requires evidence`);
    }
    if (!partial.id)
        partial.id = genId();
    if (!partial.tags)
        partial.tags = [];
    if (!partial.confidence)
        partial.confidence = confidence(80);
    if (!partial.fixable)
        partial.fixable = 'none';
    return partial;
}
/** Create a placeholder Finding — used before real analysis is implemented */
export function createPlaceholderFinding(title, explanation, category = 'project') {
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
//# sourceMappingURL=Finding.js.map