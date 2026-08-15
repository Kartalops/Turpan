export function buildPatchEvidenceReport(experiment, options) {
    const testsPassed = experiment.validation.filter((result) => result.passed);
    const confidence = Math.max(0, Math.min(100, Math.round(experiment.score +
        experiment.reproductionFlips.filter((flip) => flip.flipped).length * 5 -
        experiment.review.concerns.length * 8)));
    return {
        experimentId: experiment.id,
        problem: experiment.finding.title,
        evidenceBefore: experiment.finding.evidence,
        rootCause: options.rootCause,
        patch: experiment.candidate,
        whyThisPatch: options.whyThisPatch,
        filesChanged: experiment.candidate.changeSummary.filesChanged,
        testsSelected: experiment.testsSelected,
        testsPassed,
        reproductionBeforeAfter: experiment.reproductionFlips,
        adversarialReview: experiment.review,
        residualRisks: options.residualRisks ?? [],
        confidence,
        applyMode: options.applyMode ?? 'never',
    };
}
//# sourceMappingURL=PatchEvidenceReport.js.map