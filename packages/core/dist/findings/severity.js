/**
 * Severity utilities
 */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
export const SEVERITY_SCORES = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
    info: 5,
};
/** Map severity to a numeric weight for scoring */
export function severityWeight(s) {
    return SEVERITY_SCORES[s];
}
/** Compare two severities — returns negative if a < b */
export function severityCmp(a, b) {
    return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}
/** Return the worst (highest) severity in a list */
export function worstSeverity(severities) {
    return severities.reduce((worst, s) => severityCmp(s, worst) < 0 ? s : worst, 'info');
}
/** Format severity as colored label string */
export function formatSeverity(s) {
    return s.toUpperCase();
}
/** Short code for severity (for compact tables) */
export function severityCode(s) {
    const map = {
        critical: 'CRIT',
        high: 'HIGH',
        medium: 'MED',
        low: 'LOW',
        info: 'INFO',
    };
    return map[s];
}
/** Long description of what a severity level means */
export const SEVERITY_DESCRIPTIONS = {
    critical: 'Must fix before release — security, data loss, or crash risk',
    high: 'Should fix soon — significant bug or vulnerability',
    medium: 'Fix when convenient — code quality or moderate issue',
    low: 'Nice to fix — minor issue or cosmetic',
    info: 'No action needed — informational observation',
};
//# sourceMappingURL=severity.js.map