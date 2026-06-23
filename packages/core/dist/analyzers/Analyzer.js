/**
 * Analyzer — generic static analysis interface for Turpan
 * Analyzers are standalone units that inspect the project and return findings.
 */
export function isAnalyzer(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'name' in value &&
        'supports' in value &&
        'run' in value);
}
//# sourceMappingURL=Analyzer.js.map