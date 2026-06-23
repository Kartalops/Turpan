export type Intent =
  | 'analyze'
  | 'review'
  | 'test'
  | 'ui'
  | 'clean'
  | 'fix'
  | 'report'
  | 'exit'
  | 'run'
  | 'cleanup-scan'
  | 'quality'
  | 'find-unused'
  | 'detect-fake'
  | 'unknown'
  | 'deep_review'
  | 'quick_review'
  | 'ui_review'
  | 'runtime_review'
  | 'code_quality_review'
  | 'cleanup_review'
  | 'security_review'
  | 'agent_output_audit'
  | 'fix_safe'
  | 'patch_only'
  | 'apply_fix'
  | 'generate_report'
  | 'open_report'
  | 'show_findings'
  | 'show_scorecard'
  | 'plugin_review';

export interface ParsedCommand {
  intent: Intent;
  raw: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

// ─── Project config ──────────────────────────────────────────────────────────
export interface ProjectConfig {
  name?: string;
}

// ─── Command overrides ───────────────────────────────────────────────────────
export interface CommandConfig {
  install?: string;
  build?: string;
  test?: string;
  lint?: string;
  typecheck?: string;
  dev?: string;
}

// ─── UI testing config ───────────────────────────────────────────────────────
export interface UiConfig {
  enabled?: boolean;
  baseUrl?: string;
  scenarios?: string[];
  viewports?: Array<'desktop' | 'mobile'>;
  /** Test user config for authenticated SaaS scenarios — never use real credentials */
  testUser?: UiTestUserConfig;
  /** Billing test mode config — never complete real payments */
  billing?: UiBillingTestConfig;
}

/**
 * Test user for authenticated UI scenarios.
 * Credentials MUST be for an isolated test account — never real users.
 */
export interface UiTestUserConfig {
  /** Opt-in flag — false means scenarios run in dry-run mode (no real submit) */
  enabled: boolean;
  /** Test user email (not a secret) */
  email: string;
  /** Test user password — kept in config for QA workflows only */
  password: string;
  /** Optional seed command (e.g., `pnpm seed:test-user`) — run through SafeCommandRunner with redaction + timeout */
  seedCommand?: string;
  /** Login page path */
  loginPath?: string;
  /** Dashboard path after login */
  dashboardPath?: string;
}

/**
 * Billing test mode config — for safe QA testing of checkout flows.
 */
export interface UiBillingTestConfig {
  /** When true, may call local test checkout endpoint (NEVER external payment processors) */
  testMode: boolean;
  /** Local checkout endpoint path (e.g., `/api/test-checkout`) */
  checkoutEndpoint?: string;
}


// ─── Fix engine config ───────────────────────────────────────────────────────
export interface FixConfig {
  mode?: 'patch-only' | 'apply' | 'auto-safe' | 'report-only';
  maxFilesChanged?: number;
  allowDependencyChanges?: boolean;
  allowFileDeletion?: boolean;
}

// ─── Security config ─────────────────────────────────────────────────────────
export type PluginPermission =
  | 'read-project-files'
  | 'read-package-metadata'
  | 'run-analysis-only'
  | 'propose-fixes'
  | 'ui-scenarios'
  | 'read-config'
  | 'network-fetch'
  | 'run-commands';

export type PluginTrustLevel = 'builtin' | 'local-trusted' | 'external-untrusted';

/** Sandbox mode for external plugins */
export type PluginSandboxMode = 'worker' | 'process';

/** Process-specific sandbox configuration */
export interface PluginProcessSandboxConfig {
  enabled?: boolean;
  memoryLimitMb?: number;
  timeoutMs?: number;
  allowNetwork?: boolean;
  allowCommands?: boolean;
}

export interface PluginSecuritySubConfig {
  allowExternal?: boolean;
  sandboxExternal?: boolean;
  /** Sandbox mode: 'worker' (default) or 'process' (OS-level isolation) */
  sandboxMode?: PluginSandboxMode;
  /** Process sandbox configuration (only used when sandboxMode: process) */
  processSandbox?: PluginProcessSandboxConfig;
  maxPluginRuntimeMs?: number;
  memoryCapMb?: number;
  localTrustedPermissions?: PluginPermission[];
  externalUntrustedPermissions?: PluginPermission[];
  pluginTrust?: Record<string, { level?: PluginTrustLevel; permissions?: PluginPermission[] }>;
}

export interface SecurityConfig {
  redactSecrets?: boolean;
  plugins?: PluginSecuritySubConfig;
}

// ─── Plugin config ───────────────────────────────────────────────────────────
export type PluginConfig = string[];

// ─── Ignore config ───────────────────────────────────────────────────────────
export interface IgnoreConfig {
  paths?: string[];
  globs?: string[];
}

// ─── Dependency Audit config ─────────────────────────────────────────────────
export interface DependencyAuditLicensePolicy {
  disallowed: string[];
  warnUnknown: boolean;
}

export interface DependencyAuditConfig {
  enabled: boolean;
  online: boolean;
  failOnCritical: boolean;
  licensePolicy: DependencyAuditLicensePolicy;
}

export interface TurpanConfig {
  version: string;
  projectPath: string;
  runPath: string;
  deepAnalysis: boolean;
  uiAnalysis: boolean;
  fixMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Plugin IDs to load for this project (empty = auto-detect) */
  plugins?: string[];
  /** Optional explicit project metadata */
  project?: ProjectConfig;
  /** Optional command overrides */
  commands?: CommandConfig;
  /** Optional UI testing config */
  ui?: UiConfig;
  /** Optional fix engine config */
  fix?: FixConfig;
  /** Optional security config */
  security?: SecurityConfig;
  /** Optional ignore paths */
  ignore?: IgnoreConfig;
  /** Optional dependency audit config */
  dependencyAudit?: DependencyAuditConfig;
}

/**
 * Shared Finding type — used across core, CLI, and any external consumers.
 * Extended from the original with structured evidence, category, confidence,
 * and fixability. Backward-compatible with the original shape.
 */
export interface Finding {
  // Core identity
  id: string;
  /** Short one-line title */
  title: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Category for grouping */
  category: string;
  /** Detailed explanation of the problem */
  explanation: string;
  /** Optional file path */
  file?: string;
  /** Optional line number */
  line?: number;
  /** Command/command that produced this finding */
  command?: string;
  /** Evidence items backing this finding */
  evidence: FindingEvidence[];
  /** How to fix — specific step-by-step or reference */
  suggestedFix?: string;
  /** Whether a fix is available */
  fixable: 'auto' | 'manual' | 'none';
  /** Confidence score 0–100 */
  confidence: number;
  /** Arbitrary tags for filtering */
  tags: string[];

  // ── Legacy fields (from original Finding type) ────────────────────────
  /** @deprecated Use `category` instead */
  type?: string;
  /** @deprecated Use `explanation` instead */
  description?: string;
  /** @deprecated Use `fixable` instead */
  fixAvailable?: boolean;
  /** @deprecated Use `suggestedFix` instead */
  fixDescription?: string;
}

export interface FindingEvidence {
  type: 'command-log' | 'code' | 'screenshot' | 'trace' | 'network' | 'console' | 'file' | 'diff' | 'metric' | 'text';
  label?: string;
  path?: string;
  excerpt?: string;
  url?: string;
  timestamp?: string;
  command?: string;
  exitCode?: number;
  value?: number;
  unit?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface Scorecard {
  overall: number;
  categories: {
    correctness: number;
    security: number;
    performance: number;
    maintainability: number;
    codeCoverage: number;
  };
  findingsCount: number;
  criticalIssues: number;
  project_readiness?: number;
}

export interface AnalysisResult {
  config: TurpanConfig;
  findings: Finding[];
  scorecard: Scorecard;
  timestamp: string;
  duration: number;
  projectPath: string;
  fingerprint?: Record<string, unknown>;
}

export interface RunMetadata {
  id: string;
  timestamp: string;
  projectPath: string;
  analysisType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  error?: string;
}
