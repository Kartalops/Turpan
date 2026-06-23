/**
 * Plugin System — public API surface.
 */
export { isPlugin } from './Plugin.js';
export { buildPluginContext } from './PluginContext.js';
export { PluginRegistry } from './PluginRegistry.js';
export { loadPlugins } from './PluginLoader.js';
// Sandbox exports — needed by CLI plugins command
export { runSandboxedPlugin } from './sandbox/PluginSandbox.js';
export { buildSandboxContext, isCommandAllowed, sanitizeCommandOutput, isDangerousCommand } from './sandbox/sandboxRunner.js';
export { validatePluginManifest } from './sandbox/manifestValidator.js';
export { PluginTrustDb } from './sandbox/trustDb.js';
export { PLUGIN_PERMISSIONS, PERMISSION_DESCRIPTIONS, LOCAL_TRUSTED_DEFAULT_PERMISSIONS, EXTERNAL_UNTRUSTED_DEFAULT_PERMISSIONS, isPermissionGranted, allPermissionsGranted, } from './sandbox/permissions.js';
export { DEFAULT_TRUSTED_PLUGINS } from './sandbox/defaults.js';
//# sourceMappingURL=index.js.map