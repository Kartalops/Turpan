/**
 * Detect Project
 * Main entry point for comprehensive project fingerprinting
 */
import type { GitInfo } from '@turpan/shared';
import { type ProjectFingerprint } from './ProjectFingerprint.js';
export interface ProjectInfo {
    path: string;
    name: string;
    packageName?: string;
    packageVersion?: string;
    isGitRepo: boolean;
    git?: GitInfo;
    hasPackageJson: boolean;
    hasTurpanConfig: boolean;
    hasSrcDir: boolean;
}
/**
 * Basic project detection (backwards compatible with Phase 1)
 */
export declare function detectBasicProject(projectPath?: string): ProjectInfo;
export declare function formatProjectInfo(info: ProjectInfo): string;
export interface ProjectDetectionResult {
    fingerprint: ProjectFingerprint;
    detectedFiles: string[];
    missingFiles: string[];
}
/**
 * Main function to fingerprint a project.
 * Uses a per-process cache to avoid redundant detection.
 * Performs comprehensive detection of all project characteristics.
 */
export declare function detectProjectAsync(projectRoot: string): Promise<ProjectFingerprint>;
/**
 * Synchronous version — for legacy callers that can't await.
 * Caches the result so subsequent calls in the same process are free.
 */
export declare function detectProject(projectRoot: string): ProjectFingerprint;
/**
 * Format a project fingerprint as a readable summary
 */
export declare function formatFingerprintSummary(fp: ProjectFingerprint): string;
//# sourceMappingURL=detectProject.d.ts.map