/**
 * Detect Package Manager
 * Detects which package manager is in use based on lock files
 */
import { fileExists } from '@turpan/shared';
export function detectPackageManager(projectRoot) {
    // Check for lock files in order of preference
    if (fileExists(`${projectRoot}/pnpm-lock.yaml`)) {
        return { packageManager: 'pnpm', lockFile: 'pnpm-lock.yaml' };
    }
    if (fileExists(`${projectRoot}/yarn.lock`)) {
        return { packageManager: 'yarn', lockFile: 'yarn.lock' };
    }
    if (fileExists(`${projectRoot}/bun.lockb`)) {
        return { packageManager: 'bun', lockFile: 'bun.lockb' };
    }
    if (fileExists(`${projectRoot}/package-lock.json`)) {
        return { packageManager: 'npm', lockFile: 'package-lock.json' };
    }
    // Also check for npm shrinkwrap
    if (fileExists(`${projectRoot}/npm-shrinkwrap.json`)) {
        return { packageManager: 'npm', lockFile: 'npm-shrinkwrap.json' };
    }
    return { packageManager: 'unknown' };
}
//# sourceMappingURL=detectPackageManager.js.map