/**
 * PluginManifestValidator — validates plugin manifests for trust and safety.
 *
 * A valid manifest is required before a plugin can be loaded.
 * This prevents malicious or malformed plugins from causing harm.
 */
import type { PluginManifest } from '../Plugin.js';
import type { ManifestValidationResult, TrustedPluginManifest } from './types.js';
/**
 * Validate a plugin manifest.
 */
export declare function validatePluginManifest(manifest: TrustedPluginManifest | PluginManifest): ManifestValidationResult;
/**
 * Parse plugin manifest from a plugin package.
 */
export declare function parsePluginManifest(packageJson: Record<string, unknown>): PluginManifest | null;
//# sourceMappingURL=manifestValidator.d.ts.map