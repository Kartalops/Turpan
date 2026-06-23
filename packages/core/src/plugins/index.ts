/**
 * Plugin System — public API surface.
 */

export type {
  Plugin,
  PluginManifest,
  PluginAnalyzers,
  PluginStages,
  PluginRuleset,
  PluginReportSection,
  PluginUIScenario,
  PluginProjectDetector,
  PluginFixer,
  PluginCommand,
  PluginCommandContext,
  PluginCommandResult,
  FixResult,
} from './Plugin.js';

export { isPlugin } from './Plugin.js';

export type {
  PluginContext,
  PluginRuntimeContext,
} from './PluginContext.js';

export { buildPluginContext } from './PluginContext.js';

export type {
  PluginRegistrySummary,
  RegisteredAnalyzer,
  RegisteredRuleset,
  RegisteredReportSection,
  RegisteredUIScenario,
  RegisteredDetector,
  RegisteredFixer,
  RegisteredCommand,
} from './PluginRegistry.js';

export { PluginRegistry } from './PluginRegistry.js';

export type { PluginLoadOptions, PluginLoadResult } from './PluginLoader.js';

export { loadPlugins } from './PluginLoader.js';

// Sandbox exports — needed by CLI plugins command
export { runSandboxedPlugin, type SandboxOptions } from './sandbox/PluginSandbox.js';
export { buildSandboxContext, isCommandAllowed, sanitizeCommandOutput, isDangerousCommand } from './sandbox/sandboxRunner.js';
export { validatePluginManifest } from './sandbox/manifestValidator.js';
export { PluginTrustDb } from './sandbox/trustDb.js';
export {
  PLUGIN_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  LOCAL_TRUSTED_DEFAULT_PERMISSIONS,
  EXTERNAL_UNTRUSTED_DEFAULT_PERMISSIONS,
  isPermissionGranted,
  allPermissionsGranted,
} from './sandbox/permissions.js';
export {
  type TrustedPluginEntry,
  type TrustedPluginManifest,
  type ManifestValidationResult,
  type PluginSecurityConfig,
} from './sandbox/types.js';
export type { PluginPermission, PluginTrustLevel } from './sandbox/types.js';
export { DEFAULT_TRUSTED_PLUGINS } from './sandbox/defaults.js';
