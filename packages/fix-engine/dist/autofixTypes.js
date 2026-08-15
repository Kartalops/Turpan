export const DEFAULT_SELF_HEALING_POLICY = {
    applyMode: 'never',
    patchBudget: {
        maxFilesChanged: 3,
        maxLinesChanged: 80,
        maxDependencyChanges: 0,
    },
    maxCandidates: 3,
    maxParallelExperiments: 2,
    requireRegressionTest: true,
    requireReproductionFlip: true,
};
//# sourceMappingURL=autofixTypes.js.map