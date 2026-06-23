/**
 * Shared types for Agent Output Audit
 */

// ── Capability Taxonomy ────────────────────────────────────────────────────────

export type CapabilityCategory =
  | 'ui-pages'
  | 'backend-endpoints'
  | 'auth'
  | 'billing'
  | 'dashboard'
  | 'tests'
  | 'mcp-server'
  | 'cli'
  | 'database'
  | 'integrations'
  | 'deployment'
  | 'docs'
  | 'api-design'
  | 'workers'
  | 'error-handling'
  | 'logging'
  | 'monitoring'
  | 'security'
  | 'config'
  | 'other';

export interface Capability {
  category: CapabilityCategory;
  name: string;
  description?: string;
  evidence?: string; // raw text from task that indicated this capability
}

// ── Task Parsing ──────────────────────────────────────────────────────────────

export interface ParsedTask {
  rawText: string;
  source: 'file' | 'shell' | '.turpan/task.md';
  capabilities: Capability[];
  agentType?: string; // e.g. "claude-code", "opencode", "cursor"
  projectHints?: string[];
}

// ── Implementation Mapping ─────────────────────────────────────────────────────

export interface ImplementedItem {
  file: string;
  type: 'route' | 'component' | 'endpoint' | 'function' | 'file' | 'script' | 'config' | 'schema' | 'test';
  capability?: CapabilityCategory;
  detail?: string; // e.g. "/api/users" for a route
  line?: number;
}

export interface ImplementationMap {
  items: ImplementedItem[];
  unmappedFiles: string[]; // files that exist but aren't wired to any capability
}

// ── Issue Detectors ───────────────────────────────────────────────────────────

export type IssueKind =
  | 'fake-implementation'
  | 'unwired-feature'
  | 'readme-mismatch'
  | 'noop-test'
  | 'placeholder-leakage'
  | 'shallow-completion'
  | 'missing-capability';

export interface AgentOutputIssue {
  kind: IssueKind;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  file?: string;
  line?: number;
  capability?: Capability;
  suggestedFix?: string;
  confidence: number; // 0-100
  evidence: EvidenceSnippet[];
}

export interface EvidenceSnippet {
  type: 'code' | 'readme' | 'test' | 'file' | 'route' | 'component' | 'text';
  path?: string;
  line?: number;
  excerpt: string;
}

// ── Completion Score ───────────────────────────────────────────────────────────

export interface CompletionScore {
  overall: number; // 0-100
  requestedFeatureCoverage: number; // % of requested capabilities that have some implementation
  implementationDepth: number; // how thorough the implementations are (0-100)
  testCoverageRelevance: number; // how meaningful the tests are (0-100)
  runtimeValidation: number; // did it actually run/work (0-100)
  uiValidation: number; // did UI actually render/interact (0-100)
  // Sub-scores
  capabilityScores: Record<string, number>; // per-capability coverage
  totalCapabilities: number;
  implementedCapabilities: number;
  missingCapabilities: Capability[];
  fakeOrShallowCapabilities: Capability[];
}

// ── Final Audit Report ────────────────────────────────────────────────────────

export interface AgentOutputAuditReport {
  task: ParsedTask;
  completion: CompletionScore;
  issues: AgentOutputIssue[];
  implementation: ImplementationMap;
  requestedCapabilities: Capability[];
  implementedCapabilities: Capability[];
  confidenceLevel: 'high' | 'medium' | 'low';
  summary: string;
  evidenceFiles: string[];
  recommendation: 'READY' | 'READY_WITH_LIMITATIONS' | 'NOT_READY' | 'MAJOR_REWORK';
}
