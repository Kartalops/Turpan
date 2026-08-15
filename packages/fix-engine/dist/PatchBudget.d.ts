import type { PatchBudget, PatchCandidate } from './autofixTypes.js';
export interface PatchBudgetResult {
    ok: boolean;
    reasons: string[];
}
export declare function checkPatchBudget(candidate: PatchCandidate, budget: PatchBudget): PatchBudgetResult;
export declare function summarizeUnifiedDiff(diff: string): PatchCandidate['changeSummary'];
//# sourceMappingURL=PatchBudget.d.ts.map