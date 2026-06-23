/**
 * ReviewContext — shared context passed through all review stages
 */
import { FindingStore } from '../findings/FindingStore.js';
export function createReviewContext(projectRoot, fingerprint, config, options = {}) {
    return {
        runId: `run-${Date.now().toString(36)}`,
        projectRoot,
        fingerprint,
        config,
        deepAnalysis: options.deepAnalysis ?? false,
        uiAnalysis: options.uiAnalysis ?? false,
        fixMode: options.fixMode ?? false,
        findings: new FindingStore(),
        stageResults: {},
        startTime: Date.now(),
        signal: options.signal,
        metadata: {},
        uiScenarios: options.uiScenarios,
        skipScenarios: options.skipScenarios,
        diffMode: options.diffMode ?? false,
        diffResult: options.diffResult,
    };
}
export function elapsedMs(ctx) {
    return Date.now() - ctx.startTime;
}
//# sourceMappingURL=ReviewContext.js.map