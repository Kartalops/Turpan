/**
 * @turpan/report — Turpan Analysis Report Generation
 *
 * Reads run artifacts from `.turpan/runs/<runId>/` and produces the final
 * Turpan Analysis output bundle:
 *   TURPAN_ANALYSIS.md       — human-readable markdown
 *   TURPAN_ANALYSIS.html     — local static HTML (offline-capable)
 *   TURPAN_FINDINGS.json     — structured findings for agents / CI
 *   TURPAN_SCORECARD.json    — machine-readable scorecard + health dimensions
 *   TURPAN_FIX_PLAN.md       — safe / risky / deferred fix plan
 *   TURPAN_PATCH.diff        — unified patch for all auto-safe fixes
 *   TURPAN_RUN_SUMMARY.json  — high-level run metadata for MCP consumers
 *   TURPAN_EVIDENCE_INDEX.md — index of all evidence files
 */

// ─── Public API ───────────────────────────────────────────────────────────────

export { MarkdownReportWriter }  from './MarkdownReportWriter.js';
export { HtmlReportWriter }      from './HtmlReportWriter.js';
export { JsonReportWriter }      from './JsonReportWriter.js';
export { ScorecardWriter }       from './ScorecardWriter.js';
export { EvidenceIndexWriter }   from './EvidenceIndexWriter.js';
export { FixPlanWriter }         from './FixPlanWriter.js';
export { RunSummaryWriter }      from './RunSummaryWriter.js';
export { PrCommentWriter }       from './PrCommentWriter.js';
export { DiffFindingsWriter }    from './DiffFindingsWriter.js';
export { ReportOpenCommand }     from './ReportOpenCommand.js';

export { generateReports }       from './generateReports.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  TurpanAnalysisData,
  Verdict,
  ValidationResults,
  LiveUiReview,
  UiScreenshot,
  ConsoleError,
  NetworkError,
  CodeQualityReview,
  SecurityReview,
  DependencyAuditSection,
  AuthenticatedSaasSection,
  AgentOutputAudit,
  DiffReview,
  FixPlan,
  EvidenceIndex,
  EvidenceFile,
  RunSummary,
  BuildHealth,
  TestHealth,
  UiHealth,
  SecurityHealth,
  ArchitectureHealth,
  DeadCodeHealth,
  AgentOutputHealth,
  ReleaseReadiness,
} from './types.js';

// ─── JSON output types (public for schema validation) ────────────────────────

export type {
  TurpanFindingsJson,
  SeverityBreakdown,
  SerializedFinding,
  SerializedEvidence,
} from './JsonReportWriter.js';

export type {
  TurpanScorecard,
  HealthDimension,
} from './ScorecardWriter.js';

export type {
  TurpanRunSummary,
  FindingsSummary,
  NextAction,
} from './RunSummaryWriter.js';

export type {
  TurpanDiffFindingsJson,
} from './DiffFindingsWriter.js';

// ─── Utility ─────────────────────────────────────────────────────────────────

export { deriveVerdict } from './types.js';