import type { PatchEvidenceReport, PatchExperiment, ApplyMode } from './autofixTypes.js';
export declare function buildPatchEvidenceReport(experiment: PatchExperiment, options: {
    rootCause: string;
    whyThisPatch: string;
    residualRisks?: string[];
    applyMode?: ApplyMode;
}): PatchEvidenceReport;
//# sourceMappingURL=PatchEvidenceReport.d.ts.map