/**
 * @turpan/report — shared types
 *
 * These types model the *output* of a complete review run — everything
 * the report writers need to render their respective formats.
 *
 * Consumers: MarkdownReportWriter, HtmlReportWriter, JsonReportWriter,
 *            ScorecardWriter, EvidenceIndexWriter, CLI commands.
 */

import type { Finding }    from '@turpan/core';
import type { Scorecard }  from '@turpan/shared';
import type {
  FixCandidate,
  FixDecision,
  FixRunResult,
  ValidationResult,
} from '@turpan/fix-engine';

// ─── Verdict ─────────────────────────────────────────────────────────────────

export type Verdict = 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY';

/** Derive a Verdict from a scorecard and findings list. */
export function deriveVerdict(scorecard: Scorecard, findings: Finding[]): Verdict {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const high     = findings.filter(f => f.severity === 'high').length;

  if (critical > 0)                          return 'NO_GO';
  if (high > 0)                              return 'CONDITIONAL_GO';
  if (scorecard.overall < 70)                return 'CONDITIONAL_GO';
  if (scorecard.overall >= 90)               return 'GO';
  return 'INTERNAL_ONLY';
}

// ─── Sub-sections ────────────────────────────────────────────────────────────

export interface ValidationResults {
  build?:     ValidationResult;
  test?:      ValidationResult;
  lint?:      ValidationResult;
  typecheck?: ValidationResult;
  ui?:        ValidationResult;
}

export interface LiveUiReview {
  routesTested:      string[];
  screenshots:       UiScreenshot[];
  consoleErrors:     ConsoleError[];
  networkErrors:     NetworkError[];
  interactionFindings: string[];
  mobileFindings:    string[];
}

export interface UiScreenshot {
  route:   string;
  path:    string;   // relative to run dir
  label?:  string;
}

export interface ConsoleError {
  route:   string;
  message: string;
  count:   number;
}

export interface NetworkError {
  route:   string;
  url:     string;
  status:  number;
  count:   number;
}

export interface CodeQualityReview {
  maintainability:   string[];
  deadCode:          string[];
  duplicateCode:     string[];
  complexity:        string[];
  unusedDependencies:string[];
}

export interface SecurityReview {
  secrets:          string[];
  auth:             string[];
  cors:             string[];
  injectionRisks:   string[];
  mcpToolRisks:     string[];
}

// ─── Dependency Audit ─────────────────────────────────────────────────────────

export interface DependencyAuditSection {
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

// ─── Authenticated SaaS Review ─────────────────────────────────────────────────

export interface AuthenticatedSaasSection {
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

// ─── Diff Review ─────────────────────────────────────────────────────────────

export interface DiffReview {
  baseRef: string;
  targetRef: string;
  changedFilesSummary: string;
  riskByFile: Array<{ file: string; risk: 'low' | 'medium' | 'high' | 'critical'; reason?: string }>;
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

export interface AgentOutputAudit {
  requestedCapabilities:  string[];
  implementedCapabilities:string[];
  missingCapabilities:    string[];
  fakeShallowImpls:       string[];
  completionScore:        number; // 0–100
  recommendation?:       string;
  confidenceLevel?:       'high' | 'medium' | 'low';
  issuesCount?: {
    critical: number;
    high:     number;
    medium:   number;
    low:      number;
  };
}

// ─── Fix Plan ────────────────────────────────────────────────────────────────

export type FixPlan = {
  safe:     FixCandidate[];
  risky:    FixCandidate[];
  deferred: FixCandidate[];
};

// ─── Evidence Index ──────────────────────────────────────────────────────────

export interface EvidenceIndex {
  logs:        EvidenceFile[];
  screenshots: EvidenceFile[];
  traces:      EvidenceFile[];
  jsonFiles:   EvidenceFile[];
  patchFiles:  EvidenceFile[];
  /** Raw file listing for anything not categorised above */
  other:       EvidenceFile[];
}

export interface EvidenceFile {
  label:  string;
  path:   string; // relative to run dir
  size:   number; // bytes, 0 if unknown
  kind:   string; // human-readable kind label
}

// ─── Run Summary (for MCP consumers) ─────────────────────────────────────────

export interface RunSummary {
  runId:          string;
  timestamp:      string;
  projectPath:    string;
  duration:       number; // ms
  verdict:        Verdict;
  overallScore:   number;
  criticalCount:  number;
  highCount:      number;
  mediumCount:    number;
  lowCount:       number;
  infoCount:      number;
  findingsCount:  number;
  scorecard:      Scorecard;
  fingerprint:    Record<string, unknown>;
  fixRunResult?:  FixRunResult;
  uiReview?:      LiveUiReview;
}

// ─── Scorecard sub-dimensions (for HTML report) ──────────────────────────────

export interface BuildHealth         { score: number; details: string[]; }
export interface TestHealth          { score: number; details: string[]; }
export interface UiHealth            { score: number; details: string[]; }
export interface SecurityHealth      { score: number; details: string[]; }
export interface ArchitectureHealth  { score: number; details: string[]; }
export interface DeadCodeHealth      { score: number; details: string[]; }
export interface AgentOutputHealth   { score: number; details: string[]; }
export interface ReleaseReadiness    { score: number; details: string[]; }

// ─── Top-level input to all report writers ───────────────────────────────────

/**
 * The complete data object passed to every writer.
 * Produced by `loadRunArtifacts()` in the CLI.
 */
export interface TurpanAnalysisData {
  runId:          string;
  runPath:        string;   // e.g. `.turpan/runs/<runId>/`
  timestamp:      string;
  duration:       number;   // ms
  projectPath:    string;   // root project path

  // Core findings
  findings:       Finding[];
  scorecard:      Scorecard;
  fingerprint:    Record<string, unknown>;

  // Fix engine output (optional — only when fix mode ran)
  fixRunResult?:  FixRunResult;

  // Extended sections (populated by individual analyzers)
  validation?:    ValidationResults;
  uiReview?:      LiveUiReview;
  codeQuality?:   CodeQualityReview;
  security?:      SecurityReview;
  agentAudit?:    AgentOutputAudit;
  /** Diff-review section — populated when reviewing a git diff (e.g. PR diff) */
  diffReview?:    DiffReview;

  /** Dependency Audit section — populated when --dependency-audit is enabled */
  dependencyAudit?: DependencyAuditSection;

  /** Authenticated SaaS Review section — populated when --ui runs with testUser */
  authenticatedSaas?: AuthenticatedSaasSection;

  // Derived
  verdict:        Verdict;
}

/** Convenience alias for the primary output artifact */
export type { Finding, Scorecard, FixCandidate, FixDecision, FixRunResult, ValidationResult };