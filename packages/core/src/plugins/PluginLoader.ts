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

import { resolve, join, isAbsolute } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import type { Plugin } from './Plugin.js';
import type { PluginContext } from './PluginContext.js';
import type { ProjectFingerprint } from '../project/index.js';
import type { PluginRegistry } from './PluginRegistry.js';
import type { TurpanConfig } from '@turpan/shared';
import { isPlugin } from './Plugin.js';
import { buildPluginContext } from './PluginContext.js';
import {
  runSandboxedPlugin,
  runProcessSandboxedPlugin,
  PluginTrustDb,
  type PluginSecurityConfig,
  type PluginPermission,
  type PluginTrustLevel,
  type PluginSandboxMode,
} from './sandbox/index.js';
import { PLUGIN_PERMISSIONS } from './sandbox/permissions.js';

// Built-in plugin map — import lazily to avoid circular deps
type BuiltinPluginId =
  | 'next'
  | 'vite'
  | 'python'
  | 'saas'
  | 'mcp'
  | 'security-basic';

const BUILTIN_PLUGIN_MODULES: Record<BuiltinPluginId, () => Promise<Plugin>> = {
  'next':          () => import('./builtin/next/NextPlugin.js').then(m => m.nextPlugin),
  'vite':          () => import('./builtin/vite/VitePlugin.js').then(m => m.vitePlugin),
  'python':        () => import('./builtin/python/PythonPlugin.js').then(m => m.pythonPlugin),
  'saas':          () => import('./builtin/saas/SaaSPlugin.js').then(m => m.saasPlugin),
  'mcp':           () => import('./builtin/mcp/MCPPlugin.js').then(m => m.mcpPlugin),
  'security-basic':() => import('./builtin/security-basic/SecurityBasicPlugin.js').then(m => m.securityBasicPlugin),
};

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
  skipped: Array<{ id: string; reason: string }>;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Load all applicable plugins and register their contributions.
 */
export async function loadPlugins(
  registry: PluginRegistry,
  options: PluginLoadOptions
): Promise<PluginLoadResult> {
  const {
    projectRoot,
    fingerprint,
    enabledPlugins,
    disabledPlugins = [],
    pluginPaths = [],
    config = {} as Partial<TurpanConfig>,
    signal,
  } = options;

  const loaded: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const errors: Array<{ id: string; error: string }> = [];

  // Determine which plugin IDs to load
  const allBuiltinIds = Object.keys(BUILTIN_PLUGIN_MODULES) as BuiltinPluginId[];
  const configuredIds = enabledPlugins ?? [];

  // If no plugins configured explicitly, auto-detect based on fingerprint
  const toLoadIds: string[] = configuredIds.length > 0
    ? configuredIds
    : autoDetectPlugins(fingerprint, allBuiltinIds);

  // Always load built-ins first
  for (const id of allBuiltinIds) {
    if (signal?.aborted) break;
    if (disabledPlugins.includes(id)) {
      skipped.push({ id, reason: 'Disabled by configuration' });
      continue;
    }

    try {
      const loader = BUILTIN_PLUGIN_MODULES[id];
      if (!loader) continue;

      const plugin = await loader();

      if (!isPlugin(plugin)) {
        errors.push({ id, error: 'Invalid plugin: does not satisfy Plugin interface' });
        continue;
      }

      // Skip if not supported
      if (!plugin.supports(fingerprint)) {
        skipped.push({ id, reason: `Plugin "${id}" does not support this project type` });
        continue;
      }

      const ctx = buildPluginContext(projectRoot, fingerprint, config, signal);
      plugin.register(registry, ctx);
      loaded.push(id);
    } catch (err) {
      errors.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Load configured external/local plugins
  const rawPluginSecurity = (config?.security as { plugins?: PluginSecurityConfig } | undefined)?.plugins;
  const pluginSecurity = getNormalizedSecurity(rawPluginSecurity);

  for (const id of configuredIds) {
    if (signal?.aborted) break;
    if (allBuiltinIds.includes(id as BuiltinPluginId)) continue; // already loaded
    if (disabledPlugins.includes(id)) {
      skipped.push({ id, reason: 'Disabled by configuration' });
      continue;
    }

    // Check allowExternal before loading any external plugin
    if (!pluginSecurity?.allowExternal) {
      skipped.push({ id, reason: 'External plugins are disabled (security.plugins.allowExternal: false)' });
      continue;
    }

    const pluginInfo = await loadExternalPlugin(id, projectRoot, pluginPaths, signal);
    if (!pluginInfo) {
      errors.push({ id, error: `Could not load plugin "${id}" — not found in node_modules or plugin paths` });
      continue;
    }

    // Determine trust level
    const trustLevel = getPluginTrustLevel(id, pluginSecurity);
    const grantedPermissions = getGrantedPermissions(id, trustLevel, pluginSecurity);

    // For local-trusted and external-untrusted, check manifest permissions
    const manifestResult = pluginInfo.manifest;
    const requiredPerms = ((manifestResult as unknown as { permissions?: PluginPermission[] }).permissions ?? []) as PluginPermission[];
    const missingPerms = requiredPerms.filter(p => !grantedPermissions.includes(p));
    if (missingPerms.length > 0) {
      errors.push({ id, error: `Plugin "${id}" requires permissions not granted: ${missingPerms.join(', ')}` });
      continue;
    }

    // sandboxExternal determines whether to run sandboxed
    if (pluginSecurity.sandboxExternal && trustLevel !== 'builtin') {
      const sandboxMode: PluginSandboxMode = pluginSecurity.sandboxMode ?? 'worker';
      const timeoutMs = pluginSecurity.maxPluginRuntimeMs ?? 30000;
      const memoryLimitMb = pluginSecurity.memoryCapMb ?? 256;

      if (sandboxMode === 'process') {
        // Phase 29: OS-level isolation via child process
        const sandboxResult = await runProcessSandboxedPlugin({
          pluginPath: pluginInfo.path,
          pluginId: id,
          projectRoot,
          timeoutMs,
          memoryLimitMb,
          grantedPermissions,
          fingerprint,
          manifest: manifestResult,
          signal,
          processSandboxConfig: pluginSecurity.processSandbox,
        });

        if (!sandboxResult.success) {
          errors.push({ id, error: sandboxResult.error ?? 'Sandbox execution failed' });
          continue;
        }

        // Process mode: no Plugin object returned, just exports with findings
        // Register with the analysis-only flow (findings are collected separately)
        try {
          loaded.push(id);
        } catch (err) {
          errors.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
        continue;
      }

      // worker mode (sandboxMode === 'worker')
      const sandboxResult = await runSandboxedPlugin({
        pluginPath: pluginInfo.path,
        pluginId: id,
        projectRoot,
        timeoutMs,
        memoryCapMb: memoryLimitMb,
        grantedPermissions,
        fingerprint,
        manifest: manifestResult,
        signal,
      });

      if (!sandboxResult.success) {
        errors.push({ id, error: sandboxResult.error ?? 'Sandbox execution failed' });
        continue;
      }

      if (!sandboxResult.plugin) {
        errors.push({ id, error: 'Sandbox returned no plugin' });
        continue;
      }

      try {
        const ctx = buildPluginContext(projectRoot, fingerprint, config ?? {}, signal);
        sandboxResult.plugin.register(registry, ctx);
        loaded.push(id);
      } catch (err) {
        errors.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      // Direct load (not sandboxed — only for fully trusted or when sandbox disabled)
      if (trustLevel === 'external-untrusted' && pluginSecurity.sandboxExternal === false) {
        errors.push({ id, error: `Plugin "${id}" is external-untrusted and sandboxing is disabled — refusing to load` });
        continue;
      }

      if (!pluginInfo.instance) {
        errors.push({ id, error: `Could not instantiate plugin "${id}"` });
        continue;
      }

      if (!pluginInfo.instance.supports(fingerprint)) {
        skipped.push({ id, reason: `Plugin "${id}" does not support this project type` });
        continue;
      }

      try {
        const ctx = buildPluginContext(projectRoot, fingerprint, config ?? {}, signal);
        pluginInfo.instance.register(registry, ctx);
        loaded.push(id);
      } catch (err) {
        errors.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return { registry, loaded, skipped, errors };
}

/**
 * Load a plugin from node_modules or local plugin paths.
 * Returns plugin instance + resolved path + manifest.
 */
async function loadExternalPlugin(
  id: string,
  projectRoot: string,
  extraPaths: string[],
  signal?: AbortSignal
): Promise<{ instance: Plugin; path: string; manifest: Plugin['manifest'] } | null> {
  // Try as @turpan/plugin-{id} or turpan-plugin-{id}
  const moduleNames = [
    `@turpan/plugin-${id}`,
    `turpan-plugin-${id}`,
    id,
  ];

  for (const moduleName of moduleNames) {
    try {
      if (signal?.aborted) return null;
      // Dynamic import — Node.js will search node_modules
      const mod = await import(moduleName);
      const exported = mod.default ?? mod[id] ?? mod;
      if (isPlugin(exported)) {
        return { instance: exported, path: moduleName, manifest: exported.manifest };
      }
    } catch {
      // Try next
    }
  }

  // Try local plugin paths
  const localPaths = [
    join(projectRoot, '.turpan', 'plugins', id),
    join(projectRoot, '.turpan', 'plugins', id, 'index.ts'),
    join(projectRoot, '.turpan', 'plugins', id, 'index.js'),
  ];

  for (const localPath of localPaths) {
    if (signal?.aborted) return null;
    if (!existsSync(localPath)) continue;
    try {
      const filePath = statSync(localPath).isDirectory()
        ? join(localPath, 'index.js')
        : localPath;

      if (!existsSync(filePath)) continue;

      const mod = await import(filePath);
      const exported = mod.default ?? mod;
      if (isPlugin(exported)) {
        return { instance: exported, path: filePath, manifest: exported.manifest };
      }
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Determine which built-in plugins to auto-load based on fingerprint.
 */
function autoDetectPlugins(
  fingerprint: ProjectFingerprint,
  availableIds: string[]
): string[] {
  const detected: string[] = [];

  if (fingerprint.appType === 'nextjs') {
    if (availableIds.includes('next')) detected.push('next');
  }
  if (fingerprint.appType === 'vite-react' || fingerprint.uiFramework === 'react') {
    if (availableIds.includes('vite')) detected.push('vite');
  }
  if (fingerprint.languages.includes('python') || fingerprint.appType === 'python-bot' || fingerprint.appType === 'fastapi') {
    if (availableIds.includes('python')) detected.push('python');
  }

  // SaaS detection: if project has auth + dashboard-like structure
  if (isSaaSProject(fingerprint)) {
    if (availableIds.includes('saas')) detected.push('saas');
  }

  // MCP server detection
  if (fingerprint.appType === 'mcp-server') {
    if (availableIds.includes('mcp')) detected.push('mcp');
  }

  // Always include security-basic in deep analysis
  if (availableIds.includes('security-basic')) {
    detected.push('security-basic');
  }

  return detected;
}

function isSaaSProject(fp: ProjectFingerprint): boolean {
  const hasAuth = fp.authHints && fp.authHints.length > 0;
  const hasRoutes = fp.routeHints && fp.routeHints.length > 0;
  const hasDashboardLikePaths = fp.detectedFiles?.some(f =>
    /dashboard|settings|billing|pricing|login|register|account/i.test(f)
  );
  return Boolean(hasAuth || hasRoutes || hasDashboardLikePaths);
}

// ── Plugin security config normalization ────────────────────────────────────────

function getNormalizedSecurity(
  raw: PluginSecurityConfig | undefined
): Required<PluginSecurityConfig> {
  return {
    allowExternal: raw?.allowExternal ?? false,
    sandboxExternal: raw?.sandboxExternal ?? true,
    sandboxMode: raw?.sandboxMode ?? 'worker',
    processSandbox: {
      enabled: raw?.processSandbox?.enabled ?? false,
      memoryLimitMb: raw?.processSandbox?.memoryLimitMb ?? 256,
      timeoutMs: raw?.processSandbox?.timeoutMs ?? 30000,
      allowNetwork: raw?.processSandbox?.allowNetwork ?? false,
      allowCommands: raw?.processSandbox?.allowCommands ?? false,
    },
    maxPluginRuntimeMs: raw?.maxPluginRuntimeMs ?? 30000,
    memoryCapMb: raw?.memoryCapMb ?? 256,
    localTrustedPermissions: raw?.localTrustedPermissions ?? [
      'read-project-files',
      'read-package-metadata',
      'run-analysis-only',
      'propose-fixes',
      'ui-scenarios',
      'read-config',
    ],
    externalUntrustedPermissions: raw?.externalUntrustedPermissions ?? [
      'read-package-metadata',
      'run-analysis-only',
    ],
    pluginTrust: raw?.pluginTrust ?? {},
  };
}

// ── Plugin trust helpers ────────────────────────────────────────────────────────

function getPluginTrustLevel(
  pluginId: string,
  security: ReturnType<typeof getNormalizedSecurity>
): PluginTrustLevel {
  // Explicit override in config takes priority
  const override = security.pluginTrust?.[pluginId];
  if (override?.level) return override.level;
  return 'external-untrusted';
}

function getGrantedPermissions(
  pluginId: string,
  trustLevel: PluginTrustLevel,
  security: ReturnType<typeof getNormalizedSecurity>
): PluginPermission[] {
  // Explicit override in config takes priority
  const override = security.pluginTrust?.[pluginId];
  if (override?.permissions && override.permissions.length > 0) {
    return override.permissions as PluginPermission[];
  }
  if (trustLevel === 'builtin') {
    return [...PLUGIN_PERMISSIONS];
  }
  if (trustLevel === 'local-trusted') {
    return security.localTrustedPermissions as PluginPermission[];
  }
  return security.externalUntrustedPermissions as PluginPermission[];
}



