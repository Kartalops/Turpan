/**
 * NoopTestAnalyzer — detects tests that don't actually test anything
 *
 * Finds tests that:
 * - Only check truthy values (expect(true).toBe(true))
 * - Only render a component without assertions
 * - Are skipped (test.skip / describe.skip)
 * - Mock everything meaningful
 * - Have no actual assertions
 */
import type { AgentOutputIssue } from './types.js';
export interface NoopTestOptions {
    projectRoot: string;
    testFiles: string[];
}
export declare function analyzeNoopTests(opts: NoopTestOptions): AgentOutputIssue[];
/**
 * Find test files in a project
 */
export declare function findTestFiles(projectRoot: string, extensions?: string[]): string[];
//# sourceMappingURL=NoopTestAnalyzer.d.ts.map