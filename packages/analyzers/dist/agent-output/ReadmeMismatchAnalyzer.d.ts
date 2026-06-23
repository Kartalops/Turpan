/**
 * ReadmeMismatchAnalyzer — detects README claims not backed by code
 *
 * Detects when README.md says a feature exists but the code doesn't support it,
 * or when documentation contradicts actual implementation.
 */
import type { AgentOutputIssue } from './types.js';
export interface ReadmeMismatchOptions {
    projectRoot: string;
    taskCapabilities: string[];
}
export declare function analyzeReadmeMismatch(opts: ReadmeMismatchOptions): AgentOutputIssue[];
//# sourceMappingURL=ReadmeMismatchAnalyzer.d.ts.map