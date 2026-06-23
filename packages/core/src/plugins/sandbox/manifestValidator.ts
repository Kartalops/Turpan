/**
 * PluginManifestValidator — validates plugin manifests for trust and safety.
 *
 * A valid manifest is required before a plugin can be loaded.
 * This prevents malicious or malformed plugins from causing harm.
 */

import type { PluginManifest } from '../Plugin.js';
import type { PluginSecurityConfig, ManifestValidationResult, TrustedPluginManifest } from './types.js';
import { PLUGIN_PERMISSIONS } from './permissions.js';

// ── Required manifest fields ──────────────────────────────────────────────────

const REQUIRED_FIELDS: Array<{ field: string; check: (m: PluginManifest) => boolean }> = [
  {
    field: 'id',
    check: (m) => typeof m.id === 'string' && /^[a-z0-9-]+$/.test(m.id),
  },
  {
    field: 'version',
    check: (m) => typeof m.version === 'string' && /^\d+\.\d+\.\d+/.test(m.version),
  },
  {
    field: 'name',
    check: (m) => typeof m.name === 'string' && m.name.length > 0,
  },
];

const OPTIONAL_FIELDS = [
  'description',
  'dependsOn',
  'permissions',
  'contributes',
  'supportedAppTypes',
  'homepage',
  'repository',
];

/**
 * Validate a plugin manifest.
 */
export function validatePluginManifest(
  manifest: TrustedPluginManifest | PluginManifest
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const { field, check } of REQUIRED_FIELDS) {
    if (!(field in manifest)) {
      errors.push(`Missing required field: "${field}"`);
    } else if (!check(manifest)) {
      errors.push(`Invalid value for field "${field}": ${JSON.stringify((manifest as unknown as Record<string, unknown>)[field])}`);
    }
  }

  // Check id format
  if (manifest.id && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(manifest.id)) {
    errors.push(`Plugin id must be kebab-case (lowercase letters, numbers, hyphens): "${manifest.id}"`);
  }

  // Check version format (basic semver)
  if (manifest.version && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(manifest.version)) {
    errors.push(`Invalid semver version: "${manifest.version}"`);
  }

  // Check permissions if present
  const typedManifest = manifest as TrustedPluginManifest;
  if (typedManifest.permissions) {
    if (!Array.isArray(typedManifest.permissions)) {
      errors.push('"permissions" must be an array');
    } else {
      for (const perm of typedManifest.permissions) {
        if (!PLUGIN_PERMISSIONS.includes(perm as never)) {
          errors.push(`Unknown permission: "${perm}". Valid: ${PLUGIN_PERMISSIONS.join(', ')}`);
        }
      }
    }
  }

  // Warnings for suspicious patterns
  if (!manifest.description) {
    warnings.push('Plugin has no description — verify trust before using');
  }

  if (!typedManifest.contributes) {
    warnings.push('Plugin declares no contributions — may be a stub');
  }

  // Check supportedAppTypes if present
  if (typedManifest.supportedAppTypes && !Array.isArray(typedManifest.supportedAppTypes)) {
    errors.push('"supportedAppTypes" must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse plugin manifest from a plugin package.
 */
export function parsePluginManifest(
  packageJson: Record<string, unknown>
): PluginManifest | null {
  const manifest = packageJson['turpan-plugin'] as Record<string, unknown> | undefined;
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }

  const typed = manifest as Record<string, unknown>;

  return {
    id: typeof typed['id'] === 'string' ? typed['id'] as string : '',
    name: typeof typed['name'] === 'string' ? typed['name'] as string : '',
    version: typeof typed['version'] === 'string' ? typed['version'] as string : '',
    description: typeof typed['description'] === 'string' ? typed['description'] as string : undefined,
    dependsOn: Array.isArray(typed['dependsOn']) ? typed['dependsOn'] as string[] : undefined,
  };
}
