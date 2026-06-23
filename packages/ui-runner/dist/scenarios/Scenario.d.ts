/**
 * Scenario — base model for a real-world QA scenario.
 *
 * A scenario is a structured, realistic user flow that exercises a specific
 * part of the application (auth, billing, dashboard, etc.).
 *
 * Safety guarantees:
 * - No destructive actions (delete, drop, purge)
 * - No real purchases or payment submissions
 * - No real credential submission
 * - No bypass of auth controls
 * - All interactions are QA-only
 */
import type { Page } from 'playwright';
import type { ViewportConfig, TestUserConfig, BillingTestConfig } from '../types.js';
import type { ProjectFingerprint } from '@turpan/core';
export type ScenarioStatus = 'passed' | 'failed' | 'warn' | 'skipped';
export interface ScenarioStep {
    description: string;
    passed: boolean;
    screenshot?: string;
    error?: string;
    durationMs: number;
}
export interface ScenarioFinding {
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    explanation: string;
    fixable: 'auto' | 'manual' | 'none';
    confidence: number;
    tags: string[];
}
export interface ScenarioArtifact {
    screenshots: string[];
    traces: string[];
}
export interface ScenarioResult {
    scenarioId: string;
    scenarioName: string;
    status: ScenarioStatus;
    /** ms */
    durationMs: number;
    steps: ScenarioStep[];
    findings: ScenarioFinding[];
    artifacts: ScenarioArtifact;
    skippedReason?: string;
    finalUrl?: string;
}
export interface ScenarioContext {
    /** Base URL of the app under test */
    baseUrl: string;
    /** Active Playwright page */
    page: Page;
    /** Current viewport */
    viewport: ViewportConfig;
    /** Screenshot directory path */
    screenshotDir: string;
    /** Scenario-run output directory */
    runDir: string;
    /** Project fingerprint */
    fingerprint: ProjectFingerprint;
    /** Route map from route discovery */
    routeMap: ScenarioRouteMap;
    /** Console errors collected during this scenario */
    consoleErrors: string[];
    /** Network errors collected during this scenario */
    networkErrors: Array<{
        url: string;
        status: number;
        error?: string;
    }>;
    /** Test user config for authenticated scenarios (undefined = not configured) */
    testUser?: TestUserConfig;
    /** Billing test mode config */
    billing?: BillingTestConfig;
    /** Seed output from seedCommand run before auth scenarios */
    seedOutput?: string;
}
export interface ScenarioRouteMap {
    routes: string[];
    hasRoute: (path: string) => boolean;
    available: (paths: string[]) => string[];
}
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high';
export interface Scenario {
    /** Unique identifier, e.g. "saas-marketing", "auth-login" */
    readonly id: string;
    /** Human-readable name */
    readonly name: string;
    /** Risk level of this scenario */
    readonly riskLevel: RiskLevel;
    /** Whether this scenario supports the given project */
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    /** Execute the scenario */
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
}
/** QA-only test credentials — never used for real authentication */
export declare const SAFE_TEST_CREDENTIALS: {
    readonly email: "turpan-test@example.com";
    readonly password: "TurpanTest123!";
    readonly firstName: "Turpan";
    readonly lastName: "Test";
    readonly company: "Turpan QA";
};
export declare function captureScenarioScreenshot(ctx: ScenarioContext, label: string): Promise<string>;
export declare function makeRouteMap(routes: string[]): ScenarioRouteMap;
export declare function isAuthenticated(ctx: ScenarioContext): Promise<boolean>;
export declare function detectNoOpButton(ctx: ScenarioContext, selector: string): Promise<{
    isNoOp: boolean;
    reason: string;
}>;
export declare function detectFakeCheckout(ctx: ScenarioContext, selector: string): Promise<{
    isFake: boolean;
    reason: string;
}>;
//# sourceMappingURL=Scenario.d.ts.map