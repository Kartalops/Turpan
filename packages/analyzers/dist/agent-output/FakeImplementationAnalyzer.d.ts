/**
 * FakeImplementationAnalyzer — detects fake/shallow implementations
 *
 * Detects patterns where a function promises external integration but returns
 * hardcoded success, or where payment/auth/email/database logic is mocked
 * without clear development-only boundary.
 */
import type { AgentOutputIssue } from './types.js';
export interface AnalyzeFakeOptions {
    projectRoot: string;
    files: string[];
    taskCapabilities: string[];
}
export declare function analyzeFakeImplementations(opts: AnalyzeFakeOptions): AgentOutputIssue[];
//# sourceMappingURL=FakeImplementationAnalyzer.d.ts.map