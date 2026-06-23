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

export { runSandboxedPlugin, type SandboxOptions } from './PluginSandbox.js';
export { runProcessSandboxedPlugin, type ProcessSandboxOptions } from './PluginProcessSandbox.js';
export { buildSandboxContext, isCommandAllowed, sanitizeCommandOutput, isDangerousCommand } from './sandboxRunner.js';
export { validatePluginManifest } from './manifestValidator.js';
export { PluginTrustDb } from './trustDb.js';
export {
  PLUGIN_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  LOCAL_TRUSTED_DEFAULT_PERMISSIONS,
  EXTERNAL_UNTRUSTED_DEFAULT_PERMISSIONS,
  isPermissionGranted,
  allPermissionsGranted,
} from './permissions.js';
export {
  type TrustedPluginEntry,
  type TrustedPluginManifest,
  type ManifestValidationResult,
  type PluginSecurityConfig,
  type PluginSandboxMode,
  type PluginProcessSandboxConfig,
} from './types.js';
// Re-export types from @turpan/shared that are used in PluginLoader
export type { PluginPermission, PluginTrustLevel } from './types.js';
export { DEFAULT_TRUSTED_PLUGINS } from './defaults.js';
