/**
 * Plugin Sandboxing and Trust Boundaries
 *
 * Public exports:
 *  - runSandboxedPlugin — worker-thread sandbox execution (Phase 22)
 *  - runProcessSandboxedPlugin — child-process sandbox execution (Phase 29, opt-in)
 *  - PluginTrustDb — persistent trust database
 *  - PLUGIN_PERMISSIONS, PERMISSION_DESCRIPTIONS — permission registry
 *  - validatePluginManifest — manifest validation
 *  - isPermissionGranted, allPermissionsGranted — permission checking
 *  - buildSandboxContext — build sandboxed plugin context
 *  - isCommandAllowed, sanitizeCommandOutput, isDangerousCommand — command safety
 */
export { runSandboxedPlugin } from './PluginSandbox.js';
export { runProcessSandboxedPlugin } from './PluginProcessSandbox.js';
export { buildSandboxContext, isCommandAllowed, sanitizeCommandOutput, isDangerousCommand } from './sandboxRunner.js';
export { validatePluginManifest } from './manifestValidator.js';
export { PluginTrustDb } from './trustDb.js';
export { PLUGIN_PERMISSIONS, PERMISSION_DESCRIPTIONS, LOCAL_TRUSTED_DEFAULT_PERMISSIONS, EXTERNAL_UNTRUSTED_DEFAULT_PERMISSIONS, isPermissionGranted, allPermissionsGranted, } from './permissions.js';
export { DEFAULT_TRUSTED_PLUGINS } from './defaults.js';
//# sourceMappingURL=index.js.map