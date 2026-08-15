import type { FindingCandidate, ModelRequest, ModelResponse, ReviewBudget, ReviewMode, ToolCall } from '../protocol/index.js';
import type { ProjectFingerprint } from '../project/index.js';
export type ReviewTaskType = 'repo-mapping' | 'file-classification' | 'finding-deduplication' | 'security-review' | 'correctness-review' | 'architecture-review' | 'test-review' | 'dependency-review' | 'runtime-review' | 'ui-review' | 'finding-verification' | 'consensus';
export type LatencyClass = 'low' | 'medium' | 'high';
export type CostClass = 'low' | 'medium' | 'high';
export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable';
export interface ModelCapabilities {
    codingReasoning: number;
    architectureReasoning: number;
    securityReasoning: number;
    longContext: boolean;
    toolUse: boolean;
    vision: boolean;
    latencyClass: LatencyClass;
    costClass: CostClass;
    contextWindow: number;
    structuredOutput: boolean;
    reliabilityScore: number;
}
export interface ModelDescriptor {
    provider: string;
    model: string;
    family: string;
    capabilities: ModelCapabilities;
    enabled: boolean;
    local: boolean;
}
export interface ProviderHealth {
    status: ProviderHealthStatus;
    checkedAt: string;
    reason?: string;
}
export interface ModelProvider {
    id: string;
    invoke<T = unknown>(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse<T>>;
    stream?<T = unknown>(request: ModelRequest, model: ModelDescriptor): AsyncIterable<ModelResponse<T>>;
    capabilities(model: string): ModelCapabilities | null;
    estimateCost?(request: ModelRequest, model: ModelDescriptor): number;
    health(): Promise<ProviderHealth>;
}
export interface ModelRoutingInput {
    taskType: ReviewTaskType;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    repositoryLanguages: string[];
    changedSurface: string[];
    requiredContextSize: number;
    visionRequired?: boolean;
    browserArtifactsExist?: boolean;
    previousModelConfidence?: number;
    budget?: ReviewBudget;
    mode: ReviewMode;
    latencyPreference?: 'low' | 'balanced' | 'quality';
    availableProviders: string[];
}
export interface ModelRoute {
    primary: ModelDescriptor;
    fallbacks: ModelDescriptor[];
    reason: string;
}
export interface ModelPolicy {
    mode: ReviewMode;
    maxModelCalls: number;
    maxEstimatedCostUsd: number;
    allowRemoteProviders: boolean;
    requireDisclosure: boolean;
}
export interface ContextItem {
    id: string;
    kind: 'summary' | 'source' | 'diff' | 'test' | 'config' | 'artifact' | 'finding';
    content: string;
    path?: string;
    hash: string;
    tokensEstimate: number;
}
export interface ContextSelectionInput {
    taskType: ReviewTaskType;
    changedFiles?: string[];
    imports?: Record<string, string[]>;
    symbolReferences?: Record<string, string[]>;
    routeRelationships?: Record<string, string[]>;
    tests?: string[];
    configs?: string[];
    recentFindings?: FindingCandidate[];
    repositoryMap?: string;
    maxTokens: number;
}
export interface SpecialistGoal {
    role: 'RepoMapper' | 'SecurityReviewer' | 'CorrectnessReviewer' | 'ArchitectureReviewer' | 'TestReviewer' | 'DependencyReviewer' | 'RuntimeReviewer' | 'UIReviewer';
    taskType: ReviewTaskType;
    goal: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    requiresVision?: boolean;
}
export interface SpecialistResult {
    role: SpecialistGoal['role'];
    candidates: FindingCandidate[];
    model: string;
    provider: string;
    confidence: number;
    toolCalls: ToolCall[];
}
export type VerificationStatus = 'CONFIRMED' | 'REJECTED' | 'NEEDS_EVIDENCE';
export interface AdversarialVerification {
    candidate: FindingCandidate;
    status: VerificationStatus;
    verifierProvider: string;
    verifierModel: string;
    explanation: string;
    evidenceGaps: string[];
}
export interface ConsensusInput {
    candidate: FindingCandidate;
    verification?: AdversarialVerification;
    evidenceSignals: {
        staticEvidence?: boolean;
        runtimeReproduction?: boolean;
        testFailure?: boolean;
        browserReproduction?: boolean;
        compilerEvidence?: boolean;
        deterministicAstEvidence?: boolean;
        independentModelAgreement?: boolean;
        sourceLocationQuality?: 'none' | 'weak' | 'specific';
        reproducible?: boolean;
    };
}
export interface ConsensusResult {
    status: VerificationStatus;
    confidence: number;
    rationale: string[];
    candidate: FindingCandidate;
}
export interface PrivacyPolicy {
    mode: 'offline-only' | 'allow-remote';
    discloseSourceExfiltration: boolean;
    redactSecrets: boolean;
    allowedProviders: string[];
}
export interface IntelligentReviewInput {
    fingerprint: ProjectFingerprint;
    goals: SpecialistGoal[];
    context: ContextSelectionInput;
    budget: ModelPolicy;
}
export type { FindingCandidate };
//# sourceMappingURL=types.d.ts.map