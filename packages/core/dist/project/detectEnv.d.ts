/**
 * Detect Environment
 * Detects environment files and required environment variables
 * IMPORTANT: Never exposes secret values - only detects existence and names
 */
import type { EnvRequirement } from './ProjectFingerprint.js';
export interface EnvResult {
    envFiles: string[];
    envRequirements: EnvRequirement[];
}
export declare function detectEnv(projectRoot: string): EnvResult;
/**
 * Get a summary of environment setup
 */
export declare function getEnvSummary(result: EnvResult): string;
//# sourceMappingURL=detectEnv.d.ts.map