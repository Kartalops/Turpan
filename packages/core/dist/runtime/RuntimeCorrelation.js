export class RuntimeCorrelator {
    correlate(runtimeEvidence, sourceFiles) {
        const haystack = [
            runtimeEvidence.excerpt,
            runtimeEvidence.path,
            runtimeEvidence.metadata ? JSON.stringify(runtimeEvidence.metadata) : '',
        ].filter(Boolean).join('\n');
        const match = sourceFiles.find((file) => {
            const basename = file.path.split('/').pop();
            return Boolean(basename && haystack.includes(basename));
        });
        return {
            runtimeEvidence,
            sourceEvidence: match ? {
                kind: 'code',
                path: match.path,
                excerpt: match.content.slice(0, 1000),
            } : undefined,
            confidence: match ? 80 : 35,
        };
    }
}
//# sourceMappingURL=RuntimeCorrelation.js.map