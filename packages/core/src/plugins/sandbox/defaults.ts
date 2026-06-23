/**
 * Default trusted plugin entries — built-in plugins that ship with @turpan/core.
 *
 * These are always trusted and cannot be revoked via CLI.
 */

import type { TrustedPluginEntry } from './types.js';
import { LOCAL_TRUSTED_DEFAULT_PERMISSIONS } from './permissions.js';

export const DEFAULT_TRUSTED_PLUGINS: Record<string, TrustedPluginEntry> = {
  'next': {
    id: 'next',
    trustLevel: 'builtin',
    grantedPermissions: [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'ui-scenarios',
      'read-config',
    ],
    trustedSince: '2025-01-01T00:00:00.000Z',
    trustedBy: 'turpan-core',
    notes: 'Built-in Next.js plugin',
  },
  'vite': {
    id: 'vite',
    trustLevel: 'builtin',
    grantedPermissions: [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'ui-scenarios',
      'read-config',
    ],
    trustedSince: '2025-01-01T00:00:00.000Z',
    trustedBy: 'turpan-core',
    notes: 'Built-in Vite plugin',
  },
  'python': {
    id: 'python',
    trustLevel: 'builtin',
    grantedPermissions: [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'read-config',
    ],
    trustedSince: '2025-01-01T00:00:00.000Z',
    trustedBy: 'turpan-core',
    notes: 'Built-in Python plugin',
  },
  'saas': {
    id: 'saas',
    trustLevel: 'builtin',
    grantedPermissions: [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'ui-scenarios',
      'read-config',
    ],
    trustedSince: '2025-01-01T00:00:00.000Z',
    trustedBy: 'turpan-core',
    notes: 'Built-in SaaS plugin',
  },
  'mcp': {
    id: 'mcp',
    trustLevel: 'builtin',
    grantedPermissions: [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'ui-scenarios',
      'read-config',
      'network-fetch',
      'run-commands',
    ],
    trustedSince: '2025-01-01T00:00:00.000Z',
    trustedBy: 'turpan-core',
    notes: 'Built-in MCP server plugin',
  },
  'security-basic': {
    id: 'security-basic',
    trustLevel: 'builtin',
    grantedPermissions: [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'network-fetch',
      'read-config',
    ],
    trustedSince: '2025-01-01T00:00:00.000Z',
    trustedBy: 'turpan-core',
    notes: 'Built-in security scanning plugin',
  },
};
