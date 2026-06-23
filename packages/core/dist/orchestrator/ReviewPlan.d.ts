/**
 * ReviewPlan — decides which stages to run based on ProjectFingerprint
 */
import type { ProjectFingerprint } from '../project/index.js';
import type { StageId } from './ReviewStage.js';
export interface ReviewPlan {
    runId: string;
    stages: PlannedStage[];
    totalEstimatedTime: string;
    includesUI: boolean;
    includesPython: boolean;
    includesSecurity: boolean;
    deepAnalysis: boolean;
}
export interface PlannedStage {
    id: StageId;
    label: string;
    reason: string;
    order: number;
}
/**
 * Generate a ReviewPlan from a ProjectFingerprint.
 * Stage selection is driven by project type — Next.js/Vite gets UI stages,
 * Python bots get Python-appropriate stages, generic projects get generic stages.
 */
export declare function generateReviewPlan(fingerprint: ProjectFingerprint, options?: {
    deepAnalysis?: boolean;
    uiAnalysis?: boolean;
    fixMode?: boolean;
}): ReviewPlan;
/** Print a human-readable plan summary */
export declare function formatPlanSummary(plan: ReviewPlan): string;
//# sourceMappingURL=ReviewPlan.d.ts.map