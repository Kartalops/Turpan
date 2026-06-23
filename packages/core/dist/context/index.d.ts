import type { AnalysisResult, Finding, Scorecard, TurpanConfig } from '@turpan/shared';
import { type ProjectFingerprint } from '../project/index.js';
export interface RunContext {
    id: string;
    project: ProjectFingerprint;
    config: TurpanConfig;
    analysisResult?: AnalysisResult;
    startTime: number;
    isInteractive: boolean;
}
export declare function createRunContext(projectPath: string, config: TurpanConfig, isInteractive?: boolean): RunContext;
export declare function createEmptyScorecard(): Scorecard;
export declare function createEmptyFindings(): Finding[];
export declare function finalizeContext(ctx: RunContext, findings: Finding[], scorecard: Scorecard): AnalysisResult;
//# sourceMappingURL=index.d.ts.map