/**
 * ReviewOrchestrator — drives the full review pipeline
 */
import { createReviewContext, elapsedMs } from './ReviewContext.js';
import { generateReviewPlan } from './ReviewPlan.js';
import { placeholderStage } from './ReviewStage.js';
import { calculateScorecard, computeVerdict } from '../findings/score.js';
import { createFinding, confidence } from '../findings/Finding.js';
import { createEvidence } from '../findings/Evidence.js';
import { globalRegistry as analyzerRegistry } from '../analyzers/index.js';
import { runInstallCheck, runScriptDetection, runBuildStage, runTestStage, runLintStage, runTypecheckStage, runStaticQualityStage, runRuntimeStage, runUiLiveStage, runDiffScopedStage, } from '../runner/stages/index.js';
import { loadPlugins, PluginRegistry } from '../plugins/index.js';
/** STAGE REGISTRY — real stage implementations */
const STAGE_REGISTRY = {
    'project-fingerprint': async (ctx) => placeholderStage(ctx, 'project-fingerprint', 'Project Fingerprint'),
    'install-check': async (ctx, opts) => runInstallCheck(ctx, { force: opts.install }),
    'diff-scoped': async () => ({ stageId: 'diff-scoped', status: 'completed', findings: [], durationMs: 0 }),
    'script-detection': async (ctx) => runScriptDetection(ctx),
    'build': async (ctx, opts) => runBuildStage(ctx, { skipBuild: opts.skipBuild, timeoutMs: opts.timeoutMs }),
    'test': async (ctx, opts) => runTestStage(ctx, { skipTests: opts.skipTests, timeoutMs: opts.timeoutMs }),
    'lint': async (ctx, opts) => runLintStage(ctx, { skipLint: opts.skipLint, timeoutMs: opts.timeoutMs }),
    'typecheck': async (ctx, opts) => runTypecheckStage(ctx, { skipTypecheck: opts.skipTypecheck, timeoutMs: opts.timeoutMs }),
    'static-quality': async (ctx) => runStaticQualityStage(ctx, 'static-quality'),
    'security-basic': async (ctx) => runStaticQualityStage(ctx, 'security-basic'),
    'dead-code-basic': async (ctx) => runStaticQualityStage(ctx, 'dead-code-basic'),
    'ui-live-basic': async (ctx, opts) => runUiLiveStage(ctx, { scenarios: opts.uiScenarios, skipScenarios: opts.skipScenarios }),
    'runtime': async (ctx) => runRuntimeStage(ctx),
    'report': async (ctx) => placeholderStage(ctx, 'report', 'Report Generation'),
};
/**
 * Run the full review pipeline and return structured results.
 */
export async function runReview(orchConfig) {
    const { projectPath, fingerprint, config, deepAnalysis = false, uiAnalysis = false, fixMode = false, signal, stageOverrides, install, timeoutMs, skipBuild, skipTests, skipLint, skipTypecheck, skipUi, skipRuntime, plugins: enabledPlugins, uiScenarios, skipScenarios, diffMode, diffResult, } = orchConfig;
    // Load plugins
    const pluginRegistry = new PluginRegistry();
    let loadedPluginIds = [];
    // Built-in plugins provide the language and security analyzers used by a
    // normal review. loadPlugins itself chooses configured or auto-detected
    // plugins, so skipping it here silently removed those analyzers.
    const pluginResult = await loadPlugins(pluginRegistry, {
        projectRoot: projectPath,
        fingerprint,
        enabledPlugins: enabledPlugins ?? config.plugins,
        config,
        signal,
    });
    loadedPluginIds = pluginResult.loaded;
    // Bridge plugin-registered analyzers into the global analyzer registry
    // so that the staticQualityStage and runtime stage pick them up.
    for (const entry of pluginRegistry.listAnalyzers()) {
        try {
            analyzerRegistry.register(entry.analyzer);
        }
        catch (err) {
            // Already registered — ignore
            if (!(err instanceof Error) || !err.message.includes('already registered')) {
                throw err;
            }
        }
    }
    // Build review plan
    const plan = generateReviewPlan(fingerprint, { deepAnalysis, uiAnalysis, fixMode });
    // Create shared context — fingerprint is provided by caller (already cached)
    const ctx = createReviewContext(projectPath, fingerprint, config, {
        deepAnalysis,
        uiAnalysis,
        fixMode,
        signal,
        uiScenarios,
        skipScenarios,
        diffMode,
        diffResult,
    });
    // Set enabled plugins on context
    ctx.enabledPlugins = loadedPluginIds;
    // Decide which stages to actually run
    let stageIdsToRun = stageOverrides
        ?? plan.stages.map(s => s.id);
    // Apply stage skips
    if (skipBuild)
        stageIdsToRun = stageIdsToRun.filter(id => id !== 'build');
    if (skipTests)
        stageIdsToRun = stageIdsToRun.filter(id => id !== 'test');
    if (skipLint)
        stageIdsToRun = stageIdsToRun.filter(id => id !== 'lint');
    if (skipTypecheck)
        stageIdsToRun = stageIdsToRun.filter(id => id !== 'typecheck');
    if (skipUi)
        stageIdsToRun = stageIdsToRun.filter(id => id !== 'ui-live-basic');
    if (skipRuntime)
        stageIdsToRun = stageIdsToRun.filter(id => id !== 'runtime');
    const stageResults = [];
    // Execute each stage in order — wrapped in error boundary per stage so one
    // failure doesn't tank the whole review.
    for (const stageId of stageIdsToRun) {
        // Check cancellation
        if (signal?.aborted)
            break;
        const stageFn = STAGE_REGISTRY[stageId];
        if (!stageFn) {
            stageResults.push({
                stageId,
                status: 'skipped',
                durationMs: 0,
                findingCount: 0,
                error: 'No implementation',
            });
            continue;
        }
        const start = Date.now();
        ctx.stageResults[stageId] = { status: 'running', durationMs: 0, findingCount: 0 };
        let result;
        try {
            result = await stageFn(ctx, orchConfig);
        }
        catch (err) {
            // Stage-level error boundary — capture and continue.
            const errorMessage = err instanceof Error ? err.message : String(err);
            result = {
                stageId,
                status: 'failed',
                findings: [],
                durationMs: Date.now() - start,
                error: errorMessage,
            };
            // Surface as a finding so it appears in the report (low severity)
            try {
                ctx.findings.add(createFinding({
                    id: `stage-error-${stageId}`,
                    title: `Stage '${stageId}' failed`,
                    explanation: `The ${stageId} stage threw an unhandled error. Other stages continued. Original error: ${errorMessage}`,
                    severity: 'low',
                    category: 'error-boundary',
                    fixable: 'manual',
                    confidence: confidence(90),
                    tags: ['error-boundary', stageId],
                    evidence: [
                        createEvidence('command-log', {
                            label: `stage-${stageId}-error`,
                            excerpt: errorMessage.slice(0, 500),
                            timestamp: new Date().toISOString(),
                        }),
                    ],
                }));
            }
            catch {
                // Even adding the finding failed — that's a corner case, just continue
            }
        }
        // Merge findings into store
        try {
            ctx.findings.addMany(result.findings);
        }
        catch (err) {
            // Defensive: a malformed finding shouldn't crash the review
            // eslint-disable-next-line no-console
            console.warn(`Failed to merge findings from stage ${stageId}:`, err);
        }
        // Record result
        stageResults.push({
            stageId,
            status: result.status,
            durationMs: result.durationMs,
            findingCount: result.findings.length,
            error: result.error,
        });
        ctx.stageResults[stageId] = {
            status: result.status,
            durationMs: result.durationMs,
            findingCount: result.findings.length,
            error: result.error,
        };
        // Run diff-scoped analyzers immediately after install-check when diffMode is enabled.
        // They analyze git diff content only (no filesystem dependencies) so they don't block build.
        if (stageId === 'install-check' && diffMode) {
            const diffStart = Date.now();
            ctx.stageResults['diff-scoped'] = { status: 'running', durationMs: 0, findingCount: 0 };
            let diffResult;
            try {
                diffResult = await runDiffScopedStage(ctx);
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                diffResult = { stageId: 'diff-scoped', status: 'failed', findings: [], durationMs: Date.now() - diffStart, error: errorMessage };
            }
            try {
                ctx.findings.addMany(diffResult.findings);
            }
            catch { /* ignore */ }
            stageResults.push({ stageId: 'diff-scoped', status: diffResult.status, durationMs: diffResult.durationMs, findingCount: diffResult.findings.length, error: diffResult.error });
            ctx.stageResults['diff-scoped'] = { status: diffResult.status, durationMs: diffResult.durationMs, findingCount: diffResult.findings.length, error: diffResult.error };
        }
    }
    // Finalize
    const allFindings = ctx.findings.toJSON();
    const scorecard = calculateScorecard(allFindings);
    const verdict = computeVerdict(scorecard, allFindings);
    return {
        runId: ctx.runId,
        projectRoot: projectPath,
        plan,
        scorecard,
        verdict,
        findings: allFindings,
        stageResults,
        durationMs: elapsedMs(ctx),
    };
}
/**
 * Plan-only: generate and return the ReviewPlan without running stages.
 */
export function planReview(projectPath, fingerprint, config, options = {}) {
    return generateReviewPlan(fingerprint, options);
}
//# sourceMappingURL=ReviewOrchestrator.js.map