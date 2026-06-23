import { GitDiffResult } from '@turpan/git-diff';

/**
 * @turpan/diff-analyzers — Diff-scoped analyzer types
 */

interface DiffScopedFinding {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: 'security' | 'correctness' | 'test-coverage';
    title: string;
    explanation: string;
    file?: string;
    line?: number;
    diffLines?: Array<{
        lineNum: number;
        content: string;
        type: 'context' | 'added' | 'deleted';
    }>;
    introducedBy: 'added' | 'modified' | 'deleted' | 'renamed';
    pattern: string;
    /** Confidence score 0-100; defaults to 90 for strong pattern matches, 70 for heuristics */
    confidence: number;
}
interface DiffScopedAnalyzerContext {
    diffResult: GitDiffResult;
    projectRoot: string;
}
interface DiffScopedAnalyzer {
    id: string;
    name: string;
    run(ctx: DiffScopedAnalyzerContext): Promise<{
        findings: DiffScopedFinding[];
    }>;
}

/**
 * HunkSecurityAnalyzer — master orchestrator that runs all 8 sub-analyzers
 */

declare class DiffScopedSecurityAnalyzers {
    readonly analyzers: DiffScopedAnalyzer[];
    constructor(analyzers?: DiffScopedAnalyzer[]);
    /**
     * Run all analyzers in parallel and merge/deduplicate findings.
     */
    run(ctx: DiffScopedAnalyzerContext): Promise<{
        findings: DiffScopedFinding[];
    }>;
}

/**
 * ChangedSurfaceAnalyzer — runs all correctness analyzers in parallel and merges results
 */

declare class ChangedSurfaceAnalyzer {
    readonly id = "changed-surface";
    readonly name = "Changed Surface Analyzer";
    /**
     * Run all correctness analyzers in parallel
     */
    run(ctx: DiffScopedAnalyzerContext): Promise<{
        findings: DiffScopedFinding[];
    }>;
}
declare const ChangedSurfaceAnalyzerInstance: ChangedSurfaceAnalyzer;

/**
 * ApiContractAnalyzer — detect API route changes without corresponding client/usage updates
 */

declare const ApiContractAnalyzer: DiffScopedAnalyzer;

/**
 * FunctionSignatureAnalyzer — detect exported function signature changes without caller updates
 */

declare const FunctionSignatureAnalyzer: DiffScopedAnalyzer;

/**
 * SchemaMigrationAnalyzer — detect schema/model changes without migration evidence
 */

declare const SchemaMigrationAnalyzer: DiffScopedAnalyzer;

/**
 * EnvConfigAnalyzer — detect env requirement changes without config/docs update
 */

declare const EnvConfigAnalyzer: DiffScopedAnalyzer;

/**
 * DependencyAnalyzer — detect package dependency changes without lockfile update
 */

declare const DependencyAnalyzer: DiffScopedAnalyzer;

/**
 * RouteUiEvidenceAnalyzer — detect route/page changes without UI test evidence
 */

declare const RouteUiEvidenceAnalyzer: DiffScopedAnalyzer;

/**
 * @turpan/diff-analyzers — Test coverage types
 */

/**
 * Extended finding type for test coverage findings
 */
interface TestCoverageFinding extends Omit<DiffScopedFinding, 'category'> {
    category: 'test-coverage';
    testFile?: string;
    coverageType: 'missing-test' | 'deleted-test' | 'no-assertion' | 'critical-unchanged';
}

/**
 * TestCoverageAnalyzer — runs all test coverage analyzers in parallel and merges results
 */

declare class TestCoverageAnalyzer {
    readonly id = "test-coverage";
    readonly name = "Test Coverage Analyzer";
    /**
     * Run all test coverage analyzers in parallel
     */
    run(ctx: DiffScopedAnalyzerContext): Promise<{
        findings: TestCoverageFinding[];
    }>;
}
declare const TestCoverageAnalyzerInstance: TestCoverageAnalyzer;

/**
 * MissingTestDetector — source files changed but no related tests
 */

declare const MissingTestDetector: DiffScopedAnalyzer;

/**
 * TestDeletionAnalyzer — test files deleted
 */

declare const TestDeletionAnalyzer: DiffScopedAnalyzer;

/**
 * NoAssertionTestAnalyzer — tests changed but appear to have no assertions
 */

declare const NoAssertionTestAnalyzer: DiffScopedAnalyzer;

/**
 * CriticalFeatureCoverageAnalyzer — auth/billing/admin changes without test coverage
 */

declare const CriticalFeatureCoverageAnalyzer: DiffScopedAnalyzer;

export { ApiContractAnalyzer, ChangedSurfaceAnalyzer, ChangedSurfaceAnalyzerInstance, CriticalFeatureCoverageAnalyzer, DependencyAnalyzer, type DiffScopedAnalyzer, type DiffScopedAnalyzerContext, type DiffScopedFinding, DiffScopedSecurityAnalyzers, EnvConfigAnalyzer, FunctionSignatureAnalyzer, MissingTestDetector, NoAssertionTestAnalyzer, RouteUiEvidenceAnalyzer, SchemaMigrationAnalyzer, TestCoverageAnalyzer, TestCoverageAnalyzerInstance, TestDeletionAnalyzer };
