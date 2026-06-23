/**
 * PluginSandbox — sandboxes external plugins via worker threads.
 *
 * Built-in plugins run in-process with full Node.js privileges.
 * External plugins run inside a worker thread with:
 *  - Restricted API surface (no direct fs, net, child_process from parent context)
 *  - Only allowed project files passed as summaries
 *  - Timeout enforcement
 *  - Permission-gated operations
 */
import type { Plugin } from '../Plugin.js';
import type { PluginManifest } from '../Plugin.js';
import type { ProjectFingerprint } from '../../project/index.js';
import type { PluginPermission } from './types.js';
import type { SandboxedPluginResult } from './types.js';
export interface SandboxOptions {
    /** Path to the plugin's index file */
    pluginPath: string;
    /** Plugin module name (for display/logging) */
    pluginId: string;
    /** Project root (used to scope allowed file access) */
    projectRoot: string;
    /** Timeout in ms for plugin initialization + first analysis */
    timeoutMs: number;
    /** Memory cap in MB (soft limit) */
    memoryCapMb?: number;
    /** Allowed permissions for this plugin */
    grantedPermissions: PluginPermission[];
    /** Project fingerprint (passed to plugin.supports()) */
    fingerprint: ProjectFingerprint;
    /** Plugin manifest for validation */
    manifest: PluginManifest;
    /** Abort signal */
    signal?: AbortSignal;
}
/**
 * Load and run a plugin inside an isolated worker thread.
 * Returns the plugin exports that can be used to register contributions.
 */
export declare function runSandboxedPlugin(options: SandboxOptions): Promise<SandboxedPluginResult>;
export interface SandboxedWorkerData {
    pluginPath: string;
    pluginId: string;
    projectRoot: string;
    fingerprint: ProjectFingerprint;
    grantedPermissions: PluginPermission[];
    manifest: PluginManifest;
    isBuiltin: boolean;
}
export interface SandboxedWorkerMessage {
    type: 'success' | 'error';
    plugin?: Plugin;
    exports?: Record<string, unknown>;
    error?: string;
}
//# sourceMappingURL=PluginSandbox.d.ts.map