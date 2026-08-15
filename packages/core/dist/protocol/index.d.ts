import type { Category, Severity } from '../findings/Finding.js';
export type ReviewVerdict = 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY';
export type ReviewMode = 'fast' | 'balanced' | 'deep' | 'paranoid';
export interface ReviewBudget {
    maxModelCalls?: number;
    maxEstimatedCostUsd?: number;
    tokenBudget?: number;
    latencyPreference?: 'low' | 'balanced' | 'quality';
}
export interface ReviewRequest {
    projectPath: string;
    mode: ReviewMode;
    includeUi?: boolean;
    includeRuntime?: boolean;
    includeSecurity?: boolean;
    includeAgentAudit?: boolean;
    taskFile?: string;
    diff?: {
        baseRef: string;
        targetRef: string;
    };
    budget?: ReviewBudget;
    modelPolicy?: 'offline-only' | 'allow-remote' | 'allow-configured-providers';
}
export interface ReviewTask {
    id: string;
    kind: 'fingerprint' | 'diff' | 'command' | 'runtime' | 'ui' | 'report' | 'model';
    label: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    toolCallIds?: string[];
    artifacts?: string[];
}
export interface ToolCall {
    id: string;
    tool: string;
    input: Record<string, unknown>;
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number | null;
    timedOut?: boolean;
    redacted?: boolean;
}
export interface Artifact {
    id: string;
    kind: 'report' | 'log' | 'json' | 'html' | 'markdown' | 'screenshot' | 'trace' | 'patch' | 'other';
    path: string;
    label?: string;
    metadata?: Record<string, string | number | boolean>;
}
export interface Evidence {
    kind: 'command-log' | 'code' | 'file' | 'diff' | 'trace' | 'screenshot' | 'metric' | 'text';
    label?: string;
    path?: string;
    excerpt?: string;
    command?: string;
    exitCode?: number | null;
    metadata?: Record<string, string | number | boolean>;
}
export interface FindingCandidate {
    category: Category | string;
    severity: Severity;
    confidence: number;
    title: string;
    explanation: string;
    locations?: Array<{
        file: string;
        line?: number;
    }>;
    evidence: Evidence[];
    tags?: string[];
}
export interface VerificationResult {
    status: 'passed' | 'failed' | 'skipped';
    checks: Array<{
        name: string;
        passed: boolean;
        detail?: string;
    }>;
}
export interface Finding extends FindingCandidate {
    id: string;
    reproduction?: string;
    verification?: VerificationResult;
}
export interface StructuredOutputSchema {
    name: string;
    description?: string;
    jsonSchema?: Record<string, unknown>;
}
export interface ModelRequest {
    system: string;
    task: string;
    selectedContext: Array<{
        id: string;
        kind: 'summary' | 'source' | 'diff' | 'test' | 'config' | 'artifact' | 'finding';
        content: string;
        path?: string;
        hash?: string;
    }>;
    structuredOutputSchema: StructuredOutputSchema;
    toolAvailability?: string[];
    tokenBudget?: number;
    timeoutMs?: number;
    reasoningHint?: 'low' | 'medium' | 'high';
    metadata?: Record<string, string | number | boolean>;
}
export interface ModelUsage {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
}
export interface ModelResponse<T = unknown> {
    provider: string;
    model: string;
    structuredResult?: T;
    rawText?: string;
    usage?: ModelUsage;
    latencyMs: number;
    finishReason?: string;
    retryMetadata?: {
        attempts: number;
        fallbackUsed?: boolean;
        repairAttempted?: boolean;
    };
}
export interface ReviewRun {
    id: string;
    request: ReviewRequest;
    startedAt: string;
    finishedAt?: string;
    verdict?: ReviewVerdict;
    tasks: ReviewTask[];
    findings: Finding[];
    toolCalls: ToolCall[];
    artifacts: Artifact[];
}
//# sourceMappingURL=index.d.ts.map