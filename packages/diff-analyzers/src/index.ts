/**
 * @turpan/diff-analyzers — Diff-scoped analyzers
 */

export type { DiffScopedFinding, DiffScopedAnalyzer, DiffScopedAnalyzerContext } from './types.js';

// Security analyzers
export { DiffScopedSecurityAnalyzers } from './security/index.js';

// Correctness analyzers
export { ChangedSurfaceAnalyzer, ChangedSurfaceAnalyzerInstance } from './correctness/index.js';
export { ApiContractAnalyzer } from './correctness/index.js';
export { FunctionSignatureAnalyzer } from './correctness/index.js';
export { SchemaMigrationAnalyzer } from './correctness/index.js';
export { EnvConfigAnalyzer } from './correctness/index.js';
export { DependencyAnalyzer } from './correctness/index.js';
export { RouteUiEvidenceAnalyzer } from './correctness/index.js';

// Test coverage analyzers
export { TestCoverageAnalyzer, TestCoverageAnalyzerInstance } from './test-coverage/index.js';
export { MissingTestDetector } from './test-coverage/index.js';
export { TestDeletionAnalyzer } from './test-coverage/index.js';
export { NoAssertionTestAnalyzer } from './test-coverage/index.js';
export { CriticalFeatureCoverageAnalyzer } from './test-coverage/index.js';