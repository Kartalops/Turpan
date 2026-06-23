/**
 * Shared types for Agent Output Audit
 */
export type CapabilityCategory = 'ui-pages' | 'backend-endpoints' | 'auth' | 'billing' | 'dashboard' | 'tests' | 'mcp-server' | 'cli' | 'database' | 'integrations' | 'deployment' | 'docs' | 'api-design' | 'workers' | 'error-handling' | 'logging' | 'monitoring' | 'security' | 'config' | 'other';
export interface Capability {
    category: CapabilityCategory;
    name: string;
    description?: string;
    evidence?: string;
}
export interface ParsedTask {
    rawText: string;
    source: 'file' | 'shell' | '.turpan/task.md';
    capabilities: Capability[];
    agentType?: string;
    projectHints?: string[];
}
export interface ImplementedItem {
    file: string;
    type: 'route' | 'component' | 'endpoint' | 'function' | 'file' | 'script' | 'config' | 'schema' | 'test';
    capability?: CapabilityCategory;
    detail?: string;
    line?: number;
}
export interface ImplementationMap {
    items: ImplementedItem[];
    unmappedFiles: string[];
}
export type IssueKind = 'fake-implementation' | 'unwired-feature' | 'readme-mismatch' | 'noop-test' | 'placeholder-leakage' | 'shallow-completion' | 'missing-capability';
export interface AgentOutputIssue {
    kind: IssueKind;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    explanation: string;
    file?: string;
    line?: number;
    capability?: Capability;
    suggestedFix?: string;
    confidence: number;
    evidence: EvidenceSnippet[];
}
export interface EvidenceSnippet {
    type: 'code' | 'readme' | 'test' | 'file' | 'route' | 'component' | 'text';
    path?: string;
    line?: number;
    excerpt: string;
}
export interface CompletionScore {
    overall: number;
    requestedFeatureCoverage: number;
    implementationDepth: number;
    testCoverageRelevance: number;
    runtimeValidation: number;
    uiValidation: number;
    capabilityScores: Record<string, number>;
    totalCapabilities: number;
    implementedCapabilities: number;
    missingCapabilities: Capability[];
    fakeOrShallowCapabilities: Capability[];
}
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
//# sourceMappingURL=types.d.ts.map