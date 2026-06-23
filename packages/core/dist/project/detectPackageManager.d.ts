/**
 * Detect Package Manager
 * Detects which package manager is in use based on lock files
 */
import type { PackageManager } from './ProjectFingerprint.js';
export interface PackageManagerResult {
    packageManager: PackageManager;
    lockFile?: string;
}
export declare function detectPackageManager(projectRoot: string): PackageManagerResult;
//# sourceMappingURL=detectPackageManager.d.ts.map