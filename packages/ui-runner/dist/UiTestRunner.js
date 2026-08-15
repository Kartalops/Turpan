/**
 * UiTestRunner — orchestrates the full live UI testing flow.
 *
 * Flow:
 *  1. Determine dev command from ProjectFingerprint
 *  2. Start app server in isolated process
 *  3. Detect local URL and port
 *  4. Wait for app readiness
 *  5. Open browser
 *  6. Visit discovered routes
 *  7. Capture screenshots
 *  8. Capture console errors
 *  9. Capture network failures
 * 10. Run responsive checks
 * 11. Run basic accessibility checks
 * 12. Try realistic user interactions
 * 13. Save artifacts
 * 14. Stop app server
 * 15. Convert issues to Findings
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scenarioRegistry, makeRouteMap } from './scenarios/index.js';
import { AppServerManager } from './AppServerManager.js';
import { discoverRoutes, probeRoutes } from './RouteDiscovery.js';
import { BrowserSession } from './BrowserSession.js';
import { ScreenshotManager } from './ScreenshotManager.js';
import { ConsoleCollector } from './ConsoleCollector.js';
import { NetworkCollector } from './NetworkCollector.js';
import { InteractionPlanner } from './InteractionPlanner.js';
import { AccessibilityScanner } from './AccessibilityScanner.js';
import { ResponsiveScanner } from './ResponsiveScanner.js';
import { mapConsoleErrors, mapNetworkErrors, mapFailedInteractions, mapResponsiveIssues, mapAccessibilityIssues, mapBlankPage, determineVerdict, } from './UiFindingMapper.js';
import { SafeCommandRunner } from '@turpan/core';
const PAGE_TIMEOUT_MS = 30_000;
export class UiTestRunner {
    opts;
    server;
    browser;
    screenshotMgr;
    consoleCollector;
    networkCollector;
    interactionPlanner;
    a11yScanner;
    responsiveScanner;
    baseUrl = '';
    routes = [];
    allConsoleErrors = [];
    allNetworkErrors = [];
    allInteractionResults = [];
    responsiveResults = [];
    accessibilityResults = [];
    traceFiles = [];
    startedAt = '';
    completedAt = '';
    _scenarioResults = [];
    _seedOutput = '';
    _safeRunner;
    constructor(opts) {
        this.opts = opts;
        this.server = new AppServerManager(opts.projectRoot);
        this.browser = new BrowserSession({
            projectRoot: opts.projectRoot,
            runId: opts.runId,
            headed: opts.headed,
            mobileOnly: opts.mobileOnly,
            desktopOnly: opts.desktopOnly,
            trace: opts.trace,
        });
        const artifactDir = join(opts.projectRoot, '.turpan', 'runs', opts.runId);
        this.screenshotMgr = new ScreenshotManager(join(artifactDir, 'screenshots'));
        this.consoleCollector = new ConsoleCollector();
        this.networkCollector = new NetworkCollector('');
        this.interactionPlanner = new InteractionPlanner();
        this.a11yScanner = new AccessibilityScanner();
        this.responsiveScanner = new ResponsiveScanner();
        this._safeRunner = new SafeCommandRunner({
            projectRoot: opts.projectRoot,
            runId: opts.runId,
        });
    }
    async run() {
        this.startedAt = new Date().toISOString();
        try {
            // Phase 1: Start server
            this.baseUrl = await this.startServer();
            // Phase 2: Discover routes
            this.routes = await this.discoverAndProbeRoutes();
            // Phase 3: Launch browser
            await this.browser.launch();
            // Phase 4: Run tests per viewport
            const viewports = this.browser.getAvailableViewports();
            for (const viewport of viewports) {
                await this.runViewportTests(viewport);
            }
            // Phase 5: Responsive checks
            this.responsiveResults = await this.runResponsiveChecks(viewports);
            // Phase 6: Accessibility checks
            this.accessibilityResults = await this.runAccessibilityChecks(viewports);
            // Phase 7: Run real scenario library (unless explicitly skipped)
            if (!this.opts.skipScenarios) {
                await this.runScenarios(viewports);
            }
        }
        finally {
            // Cleanup: stop server + close browser
            await this.cleanup();
        }
        this.completedAt = new Date().toISOString();
        // Phase 7: Map to findings and produce report
        const findings = this.mapToFindings();
        const verdictResult = determineVerdict(this.routes, this.allConsoleErrors, this.allNetworkErrors, this.allInteractionResults, true // server started successfully
        );
        const summary = this.buildSummary();
        const report = {
            runId: this.opts.runId,
            projectRoot: this.opts.projectRoot,
            appType: this.detectAppType(),
            verdict: verdictResult.verdict,
            baseUrl: this.baseUrl,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            routes: this.routes,
            artifacts: {
                screenshots: this.screenshotMgr.getArtifacts(),
                consoleErrors: this.allConsoleErrors,
                networkErrors: this.allNetworkErrors,
                interactions: this.allInteractionResults,
                traces: this.traceFiles,
            },
            responsiveResults: this.responsiveResults,
            accessibilityResults: this.accessibilityResults,
            scenarioResults: this.buildScenarioSummary(),
            findings,
            summary,
        };
        // Save artifacts
        await this.saveArtifacts(report);
        return report;
    }
    // -------------------------------------------------------------------------
    // Phase 1: Server
    // -------------------------------------------------------------------------
    async startServer() {
        if (this.opts.url) {
            this.baseUrl = this.opts.url;
            return this.baseUrl;
        }
        const devCmd = AppServerManager.deriveDevCommand(this.opts.projectRoot, this.opts.fingerprint.appType, this.opts.fingerprint.packageScripts);
        if (!devCmd) {
            throw new Error('Could not determine dev command. Pass --url or ensure package.json has a "dev" script.');
        }
        const info = await this.server.start(devCmd, this.opts.fingerprint.packageManager);
        this.baseUrl = info.url;
        this.networkCollector = new NetworkCollector(this.baseUrl);
        // Wait for app to be fully ready
        await this.waitForServerReady(info.url);
        return this.baseUrl;
    }
    async waitForServerReady(url, maxAttempts = 15) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (res.status < 500)
                    return;
            }
            catch { /* not ready yet */ }
            await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error(`Server at ${url} did not become ready after ${maxAttempts * 2}s`);
    }
    // -------------------------------------------------------------------------
    // Phase 2: Route discovery
    // -------------------------------------------------------------------------
    async discoverAndProbeRoutes() {
        const appType = this.detectAppType();
        const discovered = await discoverRoutes({
            projectRoot: this.opts.projectRoot,
            appType,
            baseUrl: this.baseUrl,
            knownRoutes: (this.opts.fingerprint.routeHints ?? []).flatMap((h) => h.sampleRoutes ?? []),
        });
        // Probe all routes to determine which ones load
        const probed = await probeRoutes(this.baseUrl, discovered, 8000);
        return probed;
    }
    // -------------------------------------------------------------------------
    // Phase 3: Browser
    // -------------------------------------------------------------------------
    async runViewportTests(viewport) {
        const page = await this.browser.newPage();
        // Attach collectors before navigation
        const pageConsole = new ConsoleCollector();
        pageConsole.attach(page);
        const pageNetwork = new NetworkCollector(this.baseUrl);
        pageNetwork.attach(page);
        try {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            for (const route of this.routes) {
                await this.testRoute(page, route, viewport, pageConsole, pageNetwork);
            }
        }
        finally {
            // Accumulate errors
            this.allConsoleErrors = [...this.allConsoleErrors, ...pageConsole.getErrors()];
            this.allNetworkErrors = [...this.allNetworkErrors, ...pageNetwork.getErrors()];
            await page.close();
        }
    }
    async testRoute(page, route, viewport, consoleCollector, networkCollector) {
        const url = `${this.baseUrl}${route.path === '/' ? '' : route.path}`;
        try {
            // Clear collectors for this route
            consoleCollector.clear();
            networkCollector.clear();
            const res = await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: PAGE_TIMEOUT_MS,
            });
            // Check for blank page
            const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
            const isBlank = bodyText.trim().length < 10 && route.loaded;
            if (isBlank) {
                this.allConsoleErrors.push({
                    type: 'error',
                    text: 'Page appears blank (no visible text content)',
                    url,
                    timestamp: new Date().toISOString(),
                    isRuntimeError: true,
                    isHydrationError: false,
                });
            }
            // Wait for page to settle
            await page.waitForTimeout(1500);
            // Screenshot
            await this.screenshotMgr.capture(page, route.path, viewport);
            // Plan and execute interactions
            const steps = await this.interactionPlanner.plan(page, viewport);
            for (const step of steps) {
                const result = await this.interactionPlanner.execute(step);
                if (result.success && result.screenshot) {
                    // Interaction screenshots handled separately if needed
                }
            }
            this.allInteractionResults = [...this.allInteractionResults, ...this.interactionPlanner.getResults()];
            // Check for no-op buttons (buttons that are clickable but no network request / no DOM change)
            await this.detectNoOpButtons(page, route.path);
        }
        catch (err) {
            this.allConsoleErrors.push({
                type: 'error',
                text: `Navigation failed: ${err}`,
                url,
                timestamp: new Date().toISOString(),
                isRuntimeError: true,
                isHydrationError: false,
            });
        }
    }
    async detectNoOpButtons(page, route) {
        try {
            const buttons = await page.$$eval('button:not([disabled])', (btns) => btns.map(b => ({
                text: b.textContent?.trim() ?? '',
                hasClickHandler: !!b.onclick || b.getAttribute('role') === 'button',
            })));
            for (const btn of buttons) {
                if (!btn.text || btn.text.length < 2)
                    continue;
                if (btn.hasClickHandler)
                    continue; // has JS handler, not a no-op
                // Check if button leads anywhere (anchor with href)
                const hasHref = await page.evaluate((text) => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const found = btns.find(b => b.textContent?.trim() === text);
                    if (!found)
                        return false;
                    const parent = found.closest('a');
                    return !!(parent?.getAttribute('href'));
                }, btn.text);
                if (!hasHref && !btn.hasClickHandler) {
                    // Could be a no-op — flag as low confidence
                    this.allInteractionResults.push({
                        step: { type: 'click', selector: `button:has-text("${btn.text}")`, description: `Button: "${btn.text}"` },
                        success: false,
                        error: 'Possible no-op button detected (no handler, no href)',
                    });
                }
            }
        }
        catch { /* ignore */ }
    }
    // -------------------------------------------------------------------------
    // Phase 4: Responsive
    // -------------------------------------------------------------------------
    async runResponsiveChecks(viewports) {
        if (!this.browser.getContext())
            return [];
        return this.responsiveScanner.scan(this.browser.getContext(), this.baseUrl, viewports);
    }
    // -------------------------------------------------------------------------
    // Phase 5: Accessibility
    // -------------------------------------------------------------------------
    async runAccessibilityChecks(viewports) {
        if (!this.browser.getContext())
            return [];
        const results = [];
        const ctx = this.browser.getContext();
        for (const route of this.routes) {
            for (const viewport of viewports) {
                const page = await ctx.newPage();
                try {
                    await page.setViewportSize({ width: viewport.width, height: viewport.height });
                    await page.goto(`${this.baseUrl}${route.path === '/' ? '' : route.path}`, {
                        waitUntil: 'domcontentloaded',
                        timeout: 20_000,
                    });
                    await page.waitForTimeout(500);
                    const result = await this.a11yScanner.scan(page, viewport);
                    results.push(result);
                }
                catch { /* ignore */ }
                finally {
                    await page.close();
                }
            }
        }
        return results;
    }
    // -------------------------------------------------------------------------
    // Phase 7: Real Scenario Library
    // -------------------------------------------------------------------------
    async runScenarios(viewports) {
        const browserCtx = this.browser.getContext();
        if (!browserCtx)
            return;
        // Build route map
        const routeMap = makeRouteMap(this.routes.map(r => r.path));
        // Run seed command if testUser is enabled and seedCommand is set
        if (this.opts.testUser?.enabled && this.opts.testUser?.seedCommand) {
            await this.runSeedCommand();
        }
        // Determine which scenarios to run
        const scenarioIds = this.opts.scenarios;
        const scenarios = scenarioIds
            ? (scenarioIds.map(id => scenarioRegistry.get(id)).filter((s) => s !== undefined))
            : scenarioRegistry.supported(this.opts.fingerprint, this.routes.map(r => r.path));
        if (scenarios.length === 0)
            return;
        // Run each scenario at desktop viewport (primary)
        const viewport = viewports.find(v => v.name === 'desktop') ?? viewports[0];
        const page = await browserCtx.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const screenshotDir = join(this.opts.projectRoot, '.turpan', 'runs', this.opts.runId, 'scenarios');
        mkdirSync(screenshotDir, { recursive: true });
        const ctx = {
            baseUrl: this.baseUrl,
            page,
            viewport,
            screenshotDir,
            runDir: join(this.opts.projectRoot, '.turpan', 'runs', this.opts.runId),
            fingerprint: this.opts.fingerprint,
            routeMap,
            consoleErrors: [],
            networkErrors: [],
            testUser: this.opts.testUser,
            billing: this.opts.billing,
            seedOutput: this._seedOutput || undefined,
        };
        // Attach console collector
        const consoleCollector = new ConsoleCollector();
        consoleCollector.attach(page);
        page.on('console', msg => {
            if (msg.type() === 'error')
                ctx.consoleErrors.push(msg.text());
        });
        for (const scenario of scenarios) {
            // Reset per-scenario state
            ctx.consoleErrors = [];
            ctx.networkErrors = [];
            try {
                const result = await scenario.run(ctx);
                this._scenarioResults.push(result);
            }
            catch (err) {
                this._scenarioResults.push({
                    scenarioId: scenario.id,
                    scenarioName: scenario.name,
                    status: 'failed',
                    durationMs: 0,
                    steps: [{ description: `Error: ${err}`, passed: false, durationMs: 0 }],
                    findings: [],
                    artifacts: { screenshots: [], traces: [] },
                });
            }
        }
        await page.close();
    }
    async runSeedCommand() {
        const seedCmd = this.opts.testUser?.seedCommand ?? '';
        if (!seedCmd)
            return;
        // Ensure seed log directory exists
        const seedLogDir = join(this.opts.projectRoot, '.turpan', 'runs', this.opts.runId, 'ui');
        mkdirSync(seedLogDir, { recursive: true });
        const seedLogPath = join(seedLogDir, 'seed.log');
        const append = (line) => {
            const stamped = `[${new Date().toISOString()}] ${line}\n`;
            try {
                writeFileSync(seedLogPath, stamped, { flag: 'a' });
            }
            catch { /* ignore */ }
        };
        append(`Running seed command: ${seedCmd}`);
        const policy = this._safeRunner.checkPolicy(seedCmd);
        if (policy.blocked) {
            this._seedOutput = `[BLOCKED by policy: ${policy.reason}]`;
            append(`BLOCKED by policy: ${policy.reason}`);
            return;
        }
        try {
            const result = await this._safeRunner.run(seedCmd, {
                timeoutMs: 60_000,
            });
            // Summarize and redact any secrets in seed output before storing
            const summary = this._safeRunner.summarize(result);
            const preview = summary.exitCode === 0
                ? `exit:0, duration:${summary.durationMs}ms`
                : `exit:${summary.exitCode ?? 'signal'}, duration:${summary.durationMs}ms`;
            this._seedOutput = `Seed completed (${preview})`;
            append(`Result: ${preview}`);
        }
        catch (err) {
            this._seedOutput = `Seed command failed: ${err}`;
            append(`Failed: ${err}`);
        }
    }
    buildScenarioSummary() {
        if (this._scenarioResults.length === 0)
            return undefined;
        const results = this._scenarioResults;
        return {
            total: results.length,
            passed: results.filter(r => r.status === 'passed').length,
            failed: results.filter(r => r.status === 'failed').length,
            warn: results.filter(r => r.status === 'warn').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            scenarios: results.map(r => ({
                id: r.scenarioId,
                name: r.scenarioName,
                status: r.status,
                durationMs: r.durationMs,
            })),
        };
    }
    // -------------------------------------------------------------------------
    // Phase 8: Findings
    // -------------------------------------------------------------------------
    mapToFindings() {
        const findings = [];
        for (const route of this.routes) {
            const routeConsole = this.allConsoleErrors.filter(e => e.url?.includes(route.path));
            const routeNetwork = this.allNetworkErrors.filter(e => e.route === route.path);
            const routeInteractions = this.allInteractionResults.filter(r => r.step.description.includes(route.path));
            findings.push(...mapConsoleErrors(routeConsole, route.path));
            findings.push(...mapNetworkErrors(routeNetwork, route.path));
            findings.push(...mapFailedInteractions(routeInteractions, route.path));
        }
        findings.push(...mapResponsiveIssues(this.responsiveResults));
        findings.push(...mapAccessibilityIssues(this.accessibilityResults, ''));
        // Blank page findings
        for (const route of this.routes) {
            if (!route.loaded && route.error) {
                findings.push(mapBlankPage(route.path));
            }
        }
        return findings;
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    detectAppType() {
        const at = this.opts.fingerprint.appType;
        if (at === 'nextjs')
            return 'nextjs';
        if (at === 'vite-react')
            return 'vite-react';
        return 'unknown';
    }
    buildSummary() {
        return {
            totalRoutes: this.routes.length,
            successfulRoutes: this.routes.filter(r => r.loaded).length,
            failedRoutes: this.routes.filter(r => !r.loaded).length,
            totalScreenshots: this.screenshotMgr.getArtifacts().length,
            consoleErrors: this.allConsoleErrors.length,
            networkErrors: this.allNetworkErrors.length,
            hydrationErrors: this.allConsoleErrors.filter(e => e.isHydrationError).length,
            runtimeErrors: this.allConsoleErrors.filter(e => e.isRuntimeError).length,
            responsiveIssues: this.responsiveResults.filter(r => r.hasHorizontalOverflow).length,
            a11yIssues: this.accessibilityResults.reduce((sum, r) => sum + r.issues.length, 0),
            interactionSteps: this.allInteractionResults.length,
            interactionFailures: this.allInteractionResults.filter(r => !r.success).length,
        };
    }
    async saveArtifacts(report) {
        const runDir = join(this.opts.projectRoot, '.turpan', 'runs', this.opts.runId);
        const uiDir = join(runDir, 'ui');
        mkdirSync(uiDir, { recursive: true });
        writeFileSync(join(uiDir, 'routes.json'), JSON.stringify(report.routes, null, 2), 'utf-8');
        writeFileSync(join(uiDir, 'console-errors.json'), JSON.stringify(report.artifacts.consoleErrors, null, 2), 'utf-8');
        writeFileSync(join(uiDir, 'network-errors.json'), JSON.stringify(report.artifacts.networkErrors, null, 2), 'utf-8');
        writeFileSync(join(uiDir, 'interactions.json'), JSON.stringify(report.artifacts.interactions, null, 2), 'utf-8');
        writeFileSync(join(runDir, 'ui-test-report.json'), JSON.stringify(report, null, 2), 'utf-8');
        // Save auth-state metadata (NO secrets)
        if (this.opts.testUser?.enabled) {
            const authState = {
                enabled: true,
                // SAFETY: only email is stored (not a secret). Password NEVER persisted.
                email: this.opts.testUser.email,
                loginPath: this.opts.testUser.loginPath,
                dashboardPath: this.opts.testUser.dashboardPath,
                seedRan: !!this._seedOutput,
                seedOutputPreview: this._seedOutput
                    ? this._seedOutput.slice(0, 200) + (this._seedOutput.length > 200 ? '...' : '')
                    : null,
                scenarioCount: this._scenarioResults.length,
                scenarioStatuses: this._scenarioResults.map(r => ({
                    id: r.scenarioId,
                    status: r.status,
                })),
                // Auth state safety: NEVER include password
                passwordStored: false,
            };
            writeFileSync(join(uiDir, 'auth-state.json'), JSON.stringify(authState, null, 2), 'utf-8');
        }
        else {
            // Also write auth-state.json when disabled so report readers know the state was evaluated
            const authState = {
                enabled: false,
                scenarioCount: this._scenarioResults.length,
                scenarioStatuses: this._scenarioResults.map(r => ({ id: r.scenarioId, status: r.status })),
            };
            writeFileSync(join(uiDir, 'auth-state.json'), JSON.stringify(authState, null, 2), 'utf-8');
        }
        // Save individual scenario results as artifacts (Phase 27 standardized names)
        // Map known scenario IDs to the canonical artifact filenames
        const scenarioIdAliases = {
            'auth': 'scenario-auth',
            'next-saas-auth-good': 'scenario-auth',
            'dashboard': 'scenario-dashboard-authenticated',
            'next-saas-dashboard-authenticated': 'scenario-dashboard-authenticated',
            'next-saas-settings-noop-save': 'scenario-settings',
            'settings': 'scenario-settings',
            'billing': 'scenario-billing-test-mode',
            'next-saas-billing-test-mode': 'scenario-billing-test-mode',
            'admin': 'scenario-admin',
            'next-saas-admin-unprotected-authenticated': 'scenario-admin',
        };
        const writtenScenarios = new Set();
        for (const result of this._scenarioResults) {
            const safeId = result.scenarioId.replace(/[^a-z0-9-_]/gi, '-');
            const data = {
                scenarioId: result.scenarioId,
                scenarioName: result.scenarioName,
                status: result.status,
                durationMs: result.durationMs,
                steps: result.steps,
                findings: result.findings,
                skippedReason: result.skippedReason,
                finalUrl: result.finalUrl,
                artifacts: result.artifacts,
            };
            // Always write the raw id file (back-compat)
            writeFileSync(join(uiDir, `scenario-${safeId}.json`), JSON.stringify(data, null, 2), 'utf-8');
            // Also write the canonical Phase 27 name (deduped)
            const canonical = scenarioIdAliases[result.scenarioId];
            if (canonical && !writtenScenarios.has(canonical)) {
                writeFileSync(join(uiDir, `${canonical}.json`), JSON.stringify(data, null, 2), 'utf-8');
                writtenScenarios.add(canonical);
            }
        }
    }
    async cleanup() {
        try {
            await this.browser.close();
        }
        catch { /* ignore */ }
        try {
            await this.server.stop();
        }
        catch { /* ignore */ }
    }
}
/**
 * Convenience function to run a UI test.
 */
export async function runUiTest(opts) {
    const runner = new UiTestRunner(opts);
    return runner.run();
}
//# sourceMappingURL=UiTestRunner.js.map