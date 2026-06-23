/**
 * PluginProcessSandbox — runs external plugins in a separate Node.js process
 * with OS-level isolation and IPC communication.
 *
 * Phase 29: Optional stronger sandbox mode beyond worker threads.
 *
 * Security properties (vs worker thread):
 *  + Separate V8 heap — hard memory limit via --max-old-space-size
 *  + Separate event loop — runaway child cannot starve parent
 *  + OS-level crash isolation — segfault ≠ parent death
 *  + Explicit env allowlist — no inherited secrets
 *  + SIGKILL timeout enforcement
 */
import type { PluginManifest } from '../Plugin.js';
import type { ProjectFingerprint } from '../../project/index.js';
import type { PluginPermission } from '@turpan/shared';
import type { PluginProcessSandboxConfig, TrustedPluginManifest } from './types.js';
import type { SandboxedPluginResult } from './types.js';
export interface ProcessSandboxOptions {
    /** Path to the plugin's index file */
    pluginPath: string;
    /** Plugin module name (for display/logging) */
    pluginId: string;
    /** Project root (used to scope allowed file access) */
    projectRoot: string;
    /** Timeout in ms for plugin initialization + analysis */
    timeoutMs: number;
    /** Memory limit in MB (hard limit via --max-old-space-size) */
    memoryLimitMb?: number;
    /** Allowed permissions for this plugin */
    grantedPermissions: PluginPermission[];
    /** Project fingerprint (passed to plugin.supports()) */
    fingerprint: ProjectFingerprint;
    /** Plugin manifest for validation */
    manifest: TrustedPluginManifest | PluginManifest;
    /** Abort signal */
    signal?: AbortSignal;
    /** Process sandbox config */
    processSandboxConfig?: PluginProcessSandboxConfig;
}
/**
 * Load and run a plugin inside an isolated child Node.js process.
 * Returns the plugin exports that can be used to register contributions.
 */
export declare function runProcessSandboxedPlugin(options: ProcessSandboxOptions): Promise<SandboxedPluginResult>;
//# sourceMappingURL=PluginProcessSandbox.d.ts.map