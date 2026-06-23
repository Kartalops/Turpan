/**
 * ReportWriter — writes TURPAN_FIX_PLAN.md, TURPAN_PATCH.diff, TURPAN_FIX_RESULT.json
 */
import type { FixRunResult } from './types.js';
import type { FixPlan } from './FixPlanner.js';
export declare function renderFixPlanReport(plan: FixPlan): string;
export declare function renderFixResultReport(result: FixRunResult): string;
export interface ReportPaths {
    fixPlanPath: string;
    patchDiffPath: string;
    resultJsonPath: string;
}
export declare function writeFixReport(plan: FixPlan, result: FixRunResult, patchDiff: string, projectRoot: string): ReportPaths;
//# sourceMappingURL=reportWriter.d.ts.map