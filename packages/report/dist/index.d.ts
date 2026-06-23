import { Finding } from '@turpan/core';
import { Scorecard } from '@turpan/shared';
import { FixRunResult, ValidationResult, FixCandidate } from '@turpan/fix-engine';

/**
 * @turpan/report — shared types
 *
 * These types model the *output* of a complete review run — everything
 * the report writers need to render their respective formats.
 *
 * Consumers: MarkdownReportWriter, HtmlReportWriter, JsonReportWriter,
 *            ScorecardWriter, EvidenceIndexWriter, CLI commands.
 */

type Verdict = 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY';
/** Derive a Verdict from a scorecard and findings list. */
declare function deriveVerdict(scorecard: Scorecard, findings: Finding[]): Verdict;
interface ValidationResults {
    build?: ValidationResult;
    test?: ValidationResult;
    lint?: ValidationResult;
    typecheck?: ValidationResult;
    ui?: ValidationResult;
}
interface LiveUiReview {
    routesTested: string[];
    screenshots: UiScreenshot[];
    consoleErrors: ConsoleError[];
    networkErrors: NetworkError[];
    interactionFindings: string[];
    mobileFindings: string[];
}
interface UiScreenshot {
    route: string;
    path: string;
    label?: string;
}
interface ConsoleError {
    route: string;
    message: string;
    count: number;
}
interface NetworkError {
    route: string;
    url: string;
    status: number;
    count: number;
}
interface CodeQualityReview {
    maintainability: string[];
    deadCode: string[];
    duplicateCode: string[];
    complexity: string[];
    unusedDependencies: string[];
}
interface SecurityReview {
    secrets: string[];
    auth: string[];
    cors: string[];
    injectionRisks: string[];
    mcpToolRisks: string[];
}
interface DependencyAuditSection {
    /** online or offline mode */
    mode: 'online' | 'offline';
    /** Path to the internal SBOM (relative to run dir) */
    sbomPath: string;
    /** Path to the CycloneDX SBOM (relative to run dir) */
    sbomCdxPath: string;
    /** Total components in the SBOM */
    componentCount: number;
    /** Direct + transitive dep counts */
    directCount: number;
    transitiveCount: number;
    /** Vulnerabilities discovered */
    vulnerabilities: Array<{
        name: string;
        version: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        cveId?: string;
        title: string;
        source: 'direct' | 'transitive';
        exploitedInWild?: boolean;
    }>;
    /** License findings */
    licenses: Array<{
        name: string;
        license: string | null;
        risk: 'high' | 'medium' | 'low' | 'none';
        policyViolation: boolean;
        reason: string;
    }>;
    /** Any errors encountered (offline-only fallback, etc.) */
    errors: string[];
    /** Limitations surfaced for honesty */
    limitations: string[];
}
interface AuthenticatedSaasSection {
    /** Whether testUser was enabled for this run */
    testUserEnabled: boolean;
    /** Login status from the auth scenario */
    loginStatus: 'passed' | 'failed' | 'warn' | 'skipped' | 'not_run';
    /** Whether protected routes redirected properly */
    protectedRouteBehavior: 'redirected' | 'unprotected' | 'unknown';
    /** Dashboard usability verdict */
    dashboardUsability: 'usable' | 'partially_usable' | 'broken' | 'empty' | 'unknown';
    /** Settings behavior */
    settingsBehavior: 'wired' | 'noop_save' | 'destructive_actions_detected' | 'unknown';
    /** Billing test-mode behavior */
    billingBehavior: 'wired' | 'fake_success' | 'test_mode_disabled' | 'unknown';
    /** Admin access (unauthenticated vs authenticated) */
    adminAccess: 'protected' | 'unprotected_unauth' | 'unprotected_authed' | 'unknown';
    /** Auth state artifact path */
    authStatePath: string;
    /** Scenario artifact paths */
    scenarioArtifactPaths: {
        auth: string;
        dashboard: string;
        settings: string;
        billing: string;
        admin: string;
    };
    /** Limitations surfaced for honesty */
    limitations: string[];
}
interface DiffReview {
    baseRef: string;
    targetRef: string;
    changedFilesSummary: string;
    riskByFile: Array<{
        file: string;
        risk: 'low' | 'medium' | 'high' | 'critical';
        reason?: string;
    }>;
    changedRoutes: string[];
    changedApis: string[];
    changedComponents: string[];
    findingsIntroducedByDiff: string[];
    preExistingFindingsIgnored: string[];
    recommendation: 'approve' | 'request_changes' | 'block_merge';
    confidence: 'high' | 'medium' | 'low';
    summary: string;
    topIntroducedRisks: Array<{
        severity: string;
        title: string;
        file?: string;
        line?: number;
        explanation: string;
    }>;
    testCoverage: {
        status: 'adequate' | 'inadequate' | 'missing' | 'not-applicable';
        criticalFeaturesTested: boolean;
        testFilesChanged: number;
        sourceFilesChanged: number;
        missingTestFiles: string[];
        deletedTestFiles: string[];
        testsWithoutAssertions: string[];
    };
    mergeDecision: {
        decision: 'approve' | 'request_changes' | 'block_merge';
        blockers: string[];
        warnings: string[];
    };
}
interface AgentOutputAudit {
    requestedCapabilities: string[];
    implementedCapabilities: string[];
    missingCapabilities: string[];
    fakeShallowImpls: string[];
    completionScore: number;
    recommendation?: string;
    confidenceLevel?: 'high' | 'medium' | 'low';
    issuesCount?: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
}
type FixPlan = {
    safe: FixCandidate[];
    risky: FixCandidate[];
    deferred: FixCandidate[];
};
interface EvidenceIndex {
    logs: EvidenceFile[];
    screenshots: EvidenceFile[];
    traces: EvidenceFile[];
    jsonFiles: EvidenceFile[];
    patchFiles: EvidenceFile[];
    /** Raw file listing for anything not categorised above */
    other: EvidenceFile[];
}
interface EvidenceFile {
    label: string;
    path: string;
    size: number;
    kind: string;
}
interface RunSummary {
    runId: string;
    timestamp: string;
    projectPath: string;
    duration: number;
    verdict: Verdict;
    overallScore: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
    findingsCount: number;
    scorecard: Scorecard;
    fingerprint: Record<string, unknown>;
    fixRunResult?: FixRunResult;
    uiReview?: LiveUiReview;
}
interface BuildHealth {
    score: number;
    details: string[];
}
interface TestHealth {
    score: number;
    details: string[];
}
interface UiHealth {
    score: number;
    details: string[];
}
interface SecurityHealth {
    score: number;
    details: string[];
}
interface ArchitectureHealth {
    score: number;
    details: string[];
}
interface DeadCodeHealth {
    score: number;
    details: string[];
}
interface AgentOutputHealth {
    score: number;
    details: string[];
}
interface ReleaseReadiness {
    score: number;
    details: string[];
}
/**
 * The complete data object passed to every writer.
 * Produced by `loadRunArtifacts()` in the CLI.
 */
interface TurpanAnalysisData {
    runId: string;
    runPath: string;
    timestamp: string;
    duration: number;
    projectPath: string;
    findings: Finding[];
    scorecard: Scorecard;
    fingerprint: Record<string, unknown>;
    fixRunResult?: FixRunResult;
    validation?: ValidationResults;
    uiReview?: LiveUiReview;
    codeQuality?: CodeQualityReview;
    security?: SecurityReview;
    agentAudit?: AgentOutputAudit;
    /** Diff-review section — populated when reviewing a git diff (e.g. PR diff) */
    diffReview?: DiffReview;
    /** Dependency Audit section — populated when --dependency-audit is enabled */
    dependencyAudit?: DependencyAuditSection;
    /** Authenticated SaaS Review section — populated when --ui runs with testUser */
    authenticatedSaas?: AuthenticatedSaasSection;
    verdict: Verdict;
}

/**
 * MarkdownReportWriter — produces TURPAN_ANALYSIS.md
 *
 * Structure mirrors the Turpan Analysis spec exactly:
 *   Verdict → Executive Summary → Project Fingerprint → Scorecard →
 *   Critical / High / Medium / Low Findings →
 *   Live UI Review → Code Quality Review → Security Review →
 *   Agent Output Audit → Fix Plan → Validation Results → Evidence Index
 */

declare class MarkdownReportWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    /** Write the markdown report and return the file path written. */
    write(runPath: string): Promise<string>;
    render(): string;
    private verdictSection;
    private executiveSummary;
    private projectFingerprint;
    private scorecardSection;
    private findingsBySeverity;
    private liveUiReview;
    private codeQualityReview;
    private securityReview;
    private authenticatedSaasSection;
    private dependencyAuditSection;
    private agentOutputAudit;
    private fixPlan;
    private validationResults;
    private patchSection;
    private diffReviewSection;
    private evidenceIndex;
    private gatherEvidenceFiles;
}

/**
 * HtmlReportWriter — produces TURPAN_ANALYSIS.html
 *
 * Self-contained static HTML page. Works offline from the run directory.
 * Includes:
 *   - Severity / category filter chips
 *   - Screenshot gallery with lightbox
 *   - Scorecard gauges
 *   - Collapsible evidence excerpts
 *   - Fix plan table
 *   - All sections mirrored from the markdown report
 */

declare class HtmlReportWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    write(runPath: string): Promise<string>;
    render(): string;
}

/**
 * JsonReportWriter — produces TURPAN_FINDINGS.json
 *
 * Machine-readable findings list for agents, CI/CD pipelines, and MCP consumers.
 * Schema is versioned so downstream consumers can validate before parsing.
 */

interface TurpanFindingsJson {
    version: string;
    runId: string;
    timestamp: string;
    projectPath: string;
    verdict: string;
    total: number;
    breakdown: SeverityBreakdown;
    findings: SerializedFinding[];
}
interface SeverityBreakdown {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
}
interface SerializedFinding {
    id: string;
    title: string;
    severity: string;
    category: string;
    explanation: string;
    file?: string;
    line?: number;
    command?: string;
    evidence: SerializedEvidence[];
    suggestedFix?: string;
    fixable: string;
    confidence: number;
    tags: string[];
}
interface SerializedEvidence {
    type: string;
    label?: string;
    path?: string;
    excerpt?: string;
    url?: string;
    timestamp?: string;
    command?: string;
    exitCode?: number;
    value?: number;
    unit?: string;
}
declare class JsonReportWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    write(runPath: string): Promise<string>;
    /** Return the serialised object directly (used by CLI for --json flag). */
    build(): TurpanFindingsJson;
    private serialiseFinding;
}

/**
 * ScorecardWriter — produces TURPAN_SCORECARD.json
 *
 * Machine-readable scorecard + derived health dimensions.
 * Reads the shared Scorecard from @turpan/shared and enriches it with
 * derived health scores (Architecture, Dead Code, Agent Output, Release Readiness).
 */

interface TurpanScorecard {
    version: string;
    runId: string;
    timestamp: string;
    overall: number;
    verdict: string;
    dimensions: {
        overall: number;
        buildHealth: HealthDimension;
        testHealth: HealthDimension;
        codeQuality: HealthDimension;
        security: HealthDimension;
        uiRuntime: HealthDimension;
        uiQuality: HealthDimension;
        architecture: HealthDimension;
        deadCode: HealthDimension;
        agentOutput: HealthDimension;
        releaseReadiness: HealthDimension;
    };
    findingsSummary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
        total: number;
    };
    raw: Scorecard;
}
interface HealthDimension {
    score: number;
    label: string;
    details: string[];
}
declare class ScorecardWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    write(runPath: string): Promise<string>;
    build(): TurpanScorecard;
    private deriveArchitectureScore;
    private deriveDeadCodeScore;
    private deriveReleaseReadinessScore;
}

/**
 * EvidenceIndexWriter — produces TURPAN_EVIDENCE_INDEX.md
 *
 * Indexes all files in the run directory by kind:
 *   logs · screenshots · traces · json artifacts · patch files
 *
 * Falls back gracefully when files are missing.
 */

declare class EvidenceIndexWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    write(runPath: string): Promise<string>;
    render(): string;
    /** Return the categorised index object (used by other writers). */
    build(): EvidenceIndex;
    private gatherFiles;
    private categorise;
}

/**
 * FixPlanWriter — produces TURPAN_FIX_PLAN.md and TURPAN_PATCH.diff
 *
 * TURPAN_FIX_PLAN.md:   human-readable safe / risky / deferred breakdown
 * TURPAN_PATCH.diff:    unified patch content extracted from fix engine result
 *
 * Both files are optional — only produced when a fix run completed.
 */

declare class FixPlanWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    /** Return rendered fix plan markdown (used by tests). */
    render(): string;
    /** Write both TURPAN_FIX_PLAN.md and TURPAN_PATCH.diff. Returns paths written. */
    write(runPath: string): Promise<{
        fixPlanPath: string;
        patchPath?: string;
    }>;
    private renderFixPlan;
    private extractPatchContent;
}

/**
 * RunSummaryWriter — produces TURPAN_RUN_SUMMARY.json
 *
 * High-level run metadata for MCP consumers and programmatic callers.
 * Compact, stable schema — a single JSON object with everything an agent
 * or CI pipeline needs to decide what to do next.
 */

interface TurpanRunSummary {
    version: string;
    runId: string;
    runPath: string;
    timestamp: string;
    duration: number;
    projectPath: string;
    verdict: string;
    overallScore: number;
    findings: FindingsSummary;
    scorecard: Scorecard;
    fingerprint: Record<string, unknown>;
    hasFixResult: boolean;
    hasUiReview: boolean;
    hasSecurity: boolean;
    hasAgentAudit: boolean;
    nextActions: NextAction[];
}
interface FindingsSummary {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
}
interface NextAction {
    priority: 'critical' | 'high' | 'medium' | 'low';
    action: string;
    reason: string;
}
declare class RunSummaryWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    write(runPath: string): Promise<string>;
    build(): TurpanRunSummary;
    private deriveNextActions;
}

/**
 * PrCommentWriter — produces TURPAN_PR_COMMENT.md
 *
 * GitHub/PR-friendly markdown comment summarizing a diff review.
 * Designed to be posted directly as a PR comment.
 */

declare class PrCommentWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    /** Write the PR comment and return the file path. */
    write(runPath: string): Promise<string>;
    render(): string;
}

/**
 * DiffFindingsWriter — produces TURPAN_DIFF_FINDINGS.json
 *
 * Machine-readable structured output for CI systems consuming a diff review.
 */

interface TurpanDiffFindingsJson {
    version: string;
    runId: string;
    timestamp: string;
    projectPath: string;
    verdict: string;
    overallScore: number;
    /** Diff review metadata */
    diff: {
        baseRef: string;
        targetRef: string;
        totalFiles: number;
        filesAdded: number;
        filesModified: number;
        filesDeleted: number;
        filesRenamed: number;
        totalLinesAdded: number;
        totalLinesDeleted: number;
    };
    /** Recommendation for the PR */
    recommendation: {
        decision: 'approve' | 'request_changes' | 'block_merge';
        confidence: 'high' | 'medium' | 'low';
        summary: string;
        reasons: string[];
    };
    /** Risk per changed file */
    riskByFile: Array<{
        file: string;
        risk: 'low' | 'medium' | 'high' | 'critical';
        reason?: string;
        changeType: string;
        linesAdded: number;
        linesDeleted: number;
    }>;
    /** Changed routes/APIs/components */
    changedSurface: {
        routes: string[];
        apis: string[];
        components: string[];
        ownership: Array<{
            file: string;
            ownership: string;
        }>;
    };
    /** Findings that are specifically caused by / located in the diff */
    diffFindings: Array<{
        id: string;
        severity: string;
        category: string;
        title: string;
        explanation: string;
        file?: string;
        line?: number;
        introducedBy: string;
    }>;
    /** All findings (same schema as TURPAN_FINDINGS.json) */
    allFindings: Array<{
        id: string;
        title: string;
        severity: string;
        category: string;
        explanation: string;
        file?: string;
        line?: number;
        suggestedFix?: string;
        fixable: string;
        confidence: number;
        tags: string[];
    }>;
    /** Findings specifically introduced by this diff (not pre-existing) */
    introducedFindings: Array<{
        id: string;
        severity: string;
        category: string;
        title: string;
        explanation: string;
        file?: string;
        line?: number;
        introducedBy: string;
        confidence: number;
    }>;
    /** Findings from pre-existing code that are still present */
    preExistingFindings: Array<{
        id: string;
        title: string;
        file?: string;
    }>;
    /** Test coverage assessment for the diff */
    testCoverage: {
        status: 'adequate' | 'inadequate' | 'missing' | 'not-applicable';
        criticalFeaturesTested: boolean;
        testFilesChanged: number;
        sourceFilesChanged: number;
        missingTestFiles: string[];
        deletedTestFiles: string[];
        testsWithoutAssertions: string[];
    };
    /** Merge decision with full reasoning */
    mergeDecision: {
        decision: 'approve' | 'request_changes' | 'block_merge';
        confidence: 'high' | 'medium' | 'low';
        blockers: string[];
        warnings: string[];
        mustFix: string[];
        niceToFix: string[];
    };
    /** Severity breakdown */
    severityBreakdown: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
}
declare class DiffFindingsWriter {
    private data;
    constructor(data: TurpanAnalysisData);
    write(runPath: string): Promise<string>;
    build(): TurpanDiffFindingsJson;
}

/**
 * ReportOpenCommand — opens the Turpan Analysis HTML report in the browser.
 *
 * Usage:
 *   ReportOpenCommand.open()           — open latest run's HTML report
 *   ReportOpenCommand.open('/path/to/run-dir')  — open specific run
 *
 * Falls back to markdown if HTML not yet generated.
 */
declare class ReportOpenCommand {
    /**
     * Open the report for the given run directory.
     * Returns the path that was opened, or undefined if nothing found.
     */
    static open(runDir?: string): Promise<string | undefined>;
    /** Print the path to the latest run's report (no open). */
    static show(): string | undefined;
    /** Resolve the path to `.turpan/runs/latest` */
    static latestRunPath(): string | undefined;
    /** Resolve a specific run by ID or 'latest'. */
    static resolveRunPath(idOrLatest: string): string;
}

/**
 * generateReports — produces all Turpan Analysis output artifacts.
 *
 * Call this from the CLI after a review run completes to generate the full
 * bundle: markdown, HTML, JSON, scorecard, fix plan, patch, summary, evidence index.
 */

declare function generateReports(data: TurpanAnalysisData): Promise<{
    analysisMd: string;
    analysisHtml: string;
    findingsJson: string;
    scorecardJson: string;
    fixPlanMd: string;
    patchDiff: string | undefined;
    runSummary: string;
    evidenceMd: string;
    prComment?: string;
    diffFindings?: string;
}>;

export { type AgentOutputAudit, type AgentOutputHealth, type ArchitectureHealth, type AuthenticatedSaasSection, type BuildHealth, type CodeQualityReview, type ConsoleError, type DeadCodeHealth, type DependencyAuditSection, DiffFindingsWriter, type DiffReview, type EvidenceFile, type EvidenceIndex, EvidenceIndexWriter, type FindingsSummary, type FixPlan, FixPlanWriter, type HealthDimension, HtmlReportWriter, JsonReportWriter, type LiveUiReview, MarkdownReportWriter, type NetworkError, type NextAction, PrCommentWriter, type ReleaseReadiness, ReportOpenCommand, type RunSummary, RunSummaryWriter, ScorecardWriter, type SecurityHealth, type SecurityReview, type SerializedEvidence, type SerializedFinding, type SeverityBreakdown, type TestHealth, type TurpanAnalysisData, type TurpanDiffFindingsJson, type TurpanFindingsJson, type TurpanRunSummary, type TurpanScorecard, type UiHealth, type UiScreenshot, type ValidationResults, type Verdict, deriveVerdict, generateReports };
