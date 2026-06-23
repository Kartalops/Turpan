/**
 * uiLiveStage — runs live UI tests with the scenario library.
 *
 * Uses @turpan/ui-runner to:
 *  1. Start the dev server (or use provided URL)
 *  2. Discover routes
 *  3. Run viewport tests (desktop + mobile)
 *  4. Execute the Real Scenario Library (auth, billing, dashboard, etc.)
 *  5. Produce structured findings
 */
function makeResult(status, durationMs, findings, artifacts, error) {
    return { stageId: 'ui-live-basic', status, findings, durationMs, artifacts, error };
}
export async function runUiLiveStage(ctx, opts = {}) {
    const { fingerprint, projectRoot, runId } = ctx;
    const start = Date.now();
    // Check if UI testing is applicable
    const uiAppTypes = ['nextjs', 'vite-react', 'vite-vue', 'vite-svelte', 'remix'];
    if (!uiAppTypes.includes(fingerprint.appType)) {
        return makeResult('skipped', Date.now() - start, [], undefined, 'Not a supported UI framework');
    }
    // Dynamically import ui-runner to avoid circular dependency at the type level
    let runUiTest;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const uiRunner = require('@turpan/ui-runner');
        runUiTest = uiRunner.runUiTest;
    }
    catch {
        return makeResult('failed', Date.now() - start, [], undefined, '@turpan/ui-runner not installed or not found');
    }
    // Pull testUser / billing config from project config (safely, opt-in only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let projectConfig;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { loadConfig } = require('../../config/index.js');
        projectConfig = loadConfig(projectRoot);
    }
    catch { /* ignore */ }
    try {
        // eslint-disable-next-line @typescript-eslint/no-any
        const report = await runUiTest({
            projectRoot,
            runId,
            fingerprint: fingerprint,
            url: opts.url,
            headed: opts.headed,
            mobileOnly: opts.mobileOnly,
            desktopOnly: opts.desktopOnly,
            scenarios: opts.scenarios ?? ctx.uiScenarios,
            skipScenarios: opts.skipScenarios ?? ctx.skipScenarios ?? false,
            testUser: projectConfig?.ui?.testUser?.enabled ? {
                enabled: true,
                email: projectConfig.ui.testUser.email,
                password: projectConfig.ui.testUser.password,
                seedCommand: projectConfig.ui.testUser.seedCommand ?? '',
                loginPath: projectConfig.ui.testUser.loginPath ?? '/login',
                dashboardPath: projectConfig.ui.testUser.dashboardPath ?? '/dashboard',
            } : undefined,
            billing: projectConfig?.ui?.billing?.testMode ? {
                testMode: true,
                checkoutEndpoint: projectConfig.ui.billing.checkoutEndpoint ?? '',
            } : undefined,
        });
        // Register findings from the report into the shared store
        const registeredFindings = [];
        for (const f of report.findings) {
            try {
                ctx.findings.add(f);
                registeredFindings.push(f);
            }
            catch { /* skip malformed */ }
        }
        // Store scenario summary in context metadata
        if (report.scenarioResults) {
            ctx.metadata['uiScenarioResults'] = report.scenarioResults;
        }
        const durationMs = Date.now() - start;
        return makeResult('completed', durationMs, registeredFindings, {
            routes: report.summary.totalRoutes,
            screenshots: report.summary.totalScreenshots,
            consoleErrors: report.summary.consoleErrors,
            runtimeErrors: report.summary.runtimeErrors,
            hydrationErrors: report.summary.hydrationErrors,
            responsiveIssues: report.summary.responsiveIssues,
            a11yIssues: report.summary.a11yIssues,
            scenarioResults: report.scenarioResults,
            verdict: report.verdict,
        });
    }
    catch (err) {
        return makeResult('failed', Date.now() - start, [], undefined, String(err));
    }
}
//# sourceMappingURL=uiLiveStage.js.map