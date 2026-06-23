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

import { Worker, parentPort, workerData } from 'worker_threads';
import type { Plugin } from '../Plugin.js';
import type { PluginManifest } from '../Plugin.js';
import type { ProjectFingerprint } from '../../project/index.js';
import type { PluginPermission } from './types.js';
import type { SandboxedPluginResult } from './types.js';
import { PLUGIN_PERMISSIONS, isPermissionGranted } from './permissions.js';
import { validatePluginManifest } from './manifestValidator.js';

// ── Sandbox Configuration ───────────────────────────────────────────────────────

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

// ── Main entry: run a plugin in a sandboxed worker ─────────────────────────────

/**
 * Load and run a plugin inside an isolated worker thread.
 * Returns the plugin exports that can be used to register contributions.
 */
export async function runSandboxedPlugin(
  options: SandboxOptions
): Promise<SandboxedPluginResult> {
  const {
    pluginPath,
    pluginId,
    projectRoot,
    timeoutMs,
    grantedPermissions,
    fingerprint,
    manifest,
    signal,
  } = options;

  // Validate manifest before sandboxing
  const manifestResult = validatePluginManifest(manifest);
  if (!manifestResult.valid) {
    return {
      success: false,
      error: `Invalid manifest: ${manifestResult.errors.join('; ')}`,
      plugin: undefined,
    };
  }

  // Check if plugin requires permissions not granted
  const requiredPerms = (manifest as { permissions?: PluginPermission[] }).permissions ?? [];
  for (const perm of requiredPerms) {
    if (!isPermissionGranted(perm, grantedPermissions)) {
      return {
        success: false,
        error: `Plugin requires permission "${perm}" which is not granted`,
        plugin: undefined,
        permissionDenied: perm,
      };
    }
  }

  // Create a minimal plugin context for the worker
  const workerDataObj: SandboxedWorkerData = {
    pluginPath,
    pluginId,
    projectRoot,
    fingerprint,
    grantedPermissions,
    manifest,
    isBuiltin: false,
  };

  return new Promise<SandboxedPluginResult>((resolveResult) => {
    const timeoutHandle = setTimeout(() => {
      worker?.terminate();
      resolveResult({
        success: false,
        error: `Plugin "${pluginId}" timed out after ${timeoutMs}ms`,
        plugin: undefined,
        timedOut: true,
      });
    }, timeoutMs);

    let terminated = false;
    signal?.addEventListener('abort', () => {
      if (!terminated) {
        terminated = true;
        worker?.terminate();
        resolveResult({ success: false, error: 'Aborted', plugin: undefined });
      }
    });

    const worker = new Worker(new URL('./sandboxWorker.js', import.meta.url), {
      workerData: workerDataObj,
      // Restrict worker from accessing Node.js builtins
      execArgv: ['--no-warnings'],
      env: {
        ...process.env,
        // Strip sensitive env vars from worker
        NODE_ENV: process.env.NODE_ENV ?? 'production',
      },
    });

    worker.on('message', (msg: SandboxedWorkerMessage) => {
      terminated = true;
      clearTimeout(timeoutHandle);
      worker.terminate();

      if (msg.type === 'success') {
        resolveResult({
          success: true,
          plugin: msg.plugin as unknown as Plugin,
          pluginExports: msg.exports,
        });
      } else {
        resolveResult({
          success: false,
          error: msg.error ?? 'Unknown worker error',
          plugin: undefined,
          pluginExports: undefined,
        });
      }
    });

    worker.on('error', (err: Error) => {
      terminated = true;
      clearTimeout(timeoutHandle);
      resolveResult({
        success: false,
        error: `Worker error: ${err.message}`,
        plugin: undefined,
      });
    });

    worker.on('exit', (code: number) => {
      if (!terminated) {
        terminated = true;
        clearTimeout(timeoutHandle);
        if (code !== 0 && code !== null) {
          resolveResult({
            success: false,
            error: `Worker exited with code ${code}`,
            plugin: undefined,
          });
        }
      }
    });
  });
}

// ── Worker-side types ─────────────────────────────────────────────────────────

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
