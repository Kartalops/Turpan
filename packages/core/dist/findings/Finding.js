/**
 * Finding — structured, evidence-backed review issue
 * Every Finding MUST have evidence. Vague assertions are not Findings.
 */
import { createHash } from 'crypto';
export function confidence(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
}
function stableFindingSeed(partial) {
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
export function createDeterministicFindingId(partial, prefix = 'fnd') {
    const digest = createHash('sha1').update(stableFindingSeed(partial)).digest('hex').slice(0, 12);
    return `${prefix}-${digest}`;
}
export function createFinding(partial) {
    if (!partial.evidence || partial.evidence.length === 0) {
        throw new Error(`Finding "${partial.title}" has no evidence — every Finding requires evidence`);
    }
    if (!partial.id)
        partial.id = createDeterministicFindingId(partial);
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
//# sourceMappingURL=Finding.js.map