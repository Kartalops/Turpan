import type { Evidence, FindingCandidate, ReviewRun, ToolCall } from '../protocol/index.js';
export type RuntimeResourceKind = 'child-process' | 'dev-server' | 'port' | 'browser-session' | 'temp-directory' | 'worktree' | 'environment';
export interface RuntimeResource {
    id: string;
    runId: string;
    kind: RuntimeResourceKind;
    label: string;
    metadata: Record<string, string | number | boolean>;
    cleanup: () => Promise<void> | void;
    createdAt: string;
    cleanedAt?: string;
}
export interface RuntimeEvent {
    runId: string;
    resourceId?: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
}
export interface BootCandidate {
    id: string;
    command: string;
    cwd: string;
    source: string;
    rank: number;
    reason: string;
    env?: Record<string, string>;
    expectedUrl?: string;
}
export interface HealthSignal {
    kind: 'stdout' | 'port' | 'http' | 'process';
    ok: boolean;
    detail: string;
}
export interface HealthCheckResult {
    ready: boolean;
    signals: HealthSignal[];
}
export type UiActionRisk = 'SAFE' | 'REVIEW_REQUIRED' | 'FORBIDDEN';
export interface SemanticElement {
    role?: string;
    accessibleName?: string;
    nearbyText?: string;
    route?: string;
    formAction?: string;
    destination?: string;
    destructiveHint?: boolean;
    externalWriteHint?: boolean;
}
export interface UiAction {
    id: string;
    kind: 'openPage' | 'click' | 'type' | 'select' | 'submit' | 'back' | 'reload' | 'waitFor';
    element?: SemanticElement;
    value?: string;
}
export interface UiActionDecision {
    risk: UiActionRisk;
    reasons: string[];
}
export interface BrowserObservation {
    route: string;
    title?: string;
    actions: UiAction[];
    consoleErrors: string[];
    networkErrors: Array<{
        url: string;
        status: number;
        method?: string;
    }>;
    screenshotPath?: string;
    accessibilityTree?: unknown;
}
export interface UiState {
    id: string;
    route: string;
    screenshotPath?: string;
    consoleErrors: string[];
    networkErrors: BrowserObservation['networkErrors'];
}
export interface UiTransition {
    from: string;
    to: string;
    actionId: string;
    risk: UiActionRisk;
}
export interface UiStateGraph {
    states: UiState[];
    transitions: UiTransition[];
    visitedRoutes: string[];
}
export interface ReproductionStep {
    action: string;
    expected?: string;
    observed?: string;
}
export interface ReproductionStrategy {
    hypothesis: FindingCandidate;
    steps: ReproductionStep[];
    requiredTools: Array<'browser' | 'api' | 'cli' | 'source'>;
}
export interface ReproductionResult {
    status: 'confirmed' | 'rejected' | 'inconclusive';
    strategy: ReproductionStrategy;
    evidence: Evidence[];
}
export interface ApiEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    source?: string;
    safeToCall: boolean;
}
export interface ApiReviewPlan {
    endpoints: ApiEndpoint[];
    boundaryTests: Array<{
        endpoint: ApiEndpoint;
        description: string;
    }>;
}
export interface CliReviewPlan {
    commands: Array<{
        command: string;
        args: string[];
        reason: string;
    }>;
}
export interface RuntimeCorrelation {
    runtimeEvidence: Evidence;
    sourceEvidence?: Evidence;
    confidence: number;
}
export interface RuntimeArtifactBundle {
    runId: string;
    reproductionSteps: ReproductionStep[];
    commandHistory: ToolCall[];
    screenshots: string[];
    networkEvidence: Evidence[];
    consoleEvidence: Evidence[];
    logs: Evidence[];
    sourceLocations: Evidence[];
    environment: Record<string, string | number | boolean>;
}
export interface RuntimeReviewRun extends Pick<ReviewRun, 'id' | 'startedAt'> {
    resources: RuntimeResource[];
    events: RuntimeEvent[];
}
//# sourceMappingURL=types.d.ts.map