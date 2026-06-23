/**
 * PluginLoader — discovers and loads plugins from config and the filesystem.
 *
 * Loading order:
 *  1. Built-in plugins (always loaded first)
 *  2. Configured plugin list (from turpan.yml)
 *  3. Auto-detected plugins (based on ProjectFingerprint)
 *
 * Plugins can be:
 *  - Built-in: bundled in @turpan/core under plugins/builtin/
 *  - External: loaded from node_modules (e.g. @turpan/plugin-next)
 *  - Local: loaded from .turpan/plugins/ directory
 *
 * Sandboxing:
 *  - Built-in plugins run in-process with full Node.js privileges
 *  - External plugins run in sandboxed worker threads (when sandboxExternal: true)
 *  - Sandbox enforces timeout, restricted API, and permission checks
 */
import type { ProjectFingerprint } from '../project/index.js';
import type { PluginRegistry } from './PluginRegistry.js';
import type { TurpanConfig } from '@turpan/shared';
export interface PluginLoadOptions {
    projectRoot: string;
    fingerprint: ProjectFingerprint;
    /** Plugin IDs explicitly enabled in config (from turpan.yml) */
    enabledPlugins?: string[];
    /** Plugin IDs explicitly disabled */
    disabledPlugins?: string[];
    /** Additional plugin search paths (local plugins) */
    pluginPaths?: string[];
    /** Turpan config object */
    config?: TurpanConfig;
    signal?: AbortSignal;
}
export interface PluginLoadResult {
    registry: PluginRegistry;
    loaded: string[];
    skipped: Array<{
        id: string;
        reason: string;
    }>;
    errors: Array<{
        id: string;
        error: string;
    }>;
}
/**
 * Load all applicable plugins and register their contributions.
 */
export declare function loadPlugins(registry: PluginRegistry, options: PluginLoadOptions): Promise<PluginLoadResult>;
//# sourceMappingURL=PluginLoader.d.ts.map