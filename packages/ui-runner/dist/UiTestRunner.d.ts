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
import type { UiTestReport, TestUserConfig, BillingTestConfig } from './types.js';
import type { ProjectFingerprint } from '@turpan/core';
export interface RunUiTestOptions {
    projectRoot: string;
    runId: string;
    fingerprint: ProjectFingerprint;
    url?: string;
    headed?: boolean;
    mobileOnly?: boolean;
    desktopOnly?: boolean;
    trace?: boolean;
    /** Scenario IDs to run. If omitted, runs all supported scenarios. */
    scenarios?: string[];
    /** Skip scenario execution entirely (default: false). */
    skipScenarios?: boolean;
    /** Test user for authenticated scenarios */
    testUser?: TestUserConfig;
    /** Billing test mode configuration */
    billing?: BillingTestConfig;
}
export declare class UiTestRunner {
    private opts;
    private server;
    private browser;
    private screenshotMgr;
    private consoleCollector;
    private networkCollector;
    private interactionPlanner;
    private a11yScanner;
    private responsiveScanner;
    private baseUrl;
    private routes;
    private allConsoleErrors;
    private allNetworkErrors;
    private allInteractionResults;
    private responsiveResults;
    private accessibilityResults;
    private traceFiles;
    private startedAt;
    private completedAt;
    private _scenarioResults;
    private _seedOutput;
    private _safeRunner;
    constructor(opts: RunUiTestOptions);
    run(): Promise<UiTestReport>;
    private startServer;
    private waitForServerReady;
    private discoverAndProbeRoutes;
    private runViewportTests;
    private testRoute;
    private detectNoOpButtons;
    private runResponsiveChecks;
    private runAccessibilityChecks;
    private runScenarios;
    private runSeedCommand;
    private buildScenarioSummary;
    private mapToFindings;
    private detectAppType;
    private buildSummary;
    private saveArtifacts;
    private cleanup;
}
/**
 * Convenience function to run a UI test.
 */
export declare function runUiTest(opts: RunUiTestOptions): Promise<UiTestReport>;
//# sourceMappingURL=UiTestRunner.d.ts.map