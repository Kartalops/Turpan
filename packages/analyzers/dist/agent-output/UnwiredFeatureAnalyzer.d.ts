/**
 * UnwiredFeatureAnalyzer — detects features that exist but are not connected
 *
 * Detects:
 * - Component exists but no route imports it
 * - API route exists but UI never calls it
 * - Button exists but no handler
 * - Function defined but never called
 */
import type { AgentOutputIssue } from './types.js';
export interface UnwiredFeatureOptions {
    projectRoot: string;
    taskCapabilities: string[];
}
/**
 * Analyze the project for unwired features
 */
export declare function analyzeUnwiredFeatures(opts: UnwiredFeatureOptions): AgentOutputIssue[];
//# sourceMappingURL=UnwiredFeatureAnalyzer.d.ts.map