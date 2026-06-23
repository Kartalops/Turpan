/**
 * sandboxWorker — runs inside the worker thread, not the main process.
 *
 * This file executes in an isolated worker thread context.
 * It receives a minimal plugin API and must not expose the full Node.js runtime.
 */

import { parentPort } from 'worker_threads';
import type { SandboxedWorkerData, SandboxedWorkerMessage } from './PluginSandbox.js';
import { isPlugin } from '../Plugin.js';

declare const workerData: SandboxedWorkerData;

async function main() {
  const data = workerData as SandboxedWorkerData;

  if (!parentPort) {
    const msg: SandboxedWorkerMessage = { type: 'error', error: 'No parent port' };
    parentPort!.postMessage(msg);
    return;
  }

  try {
    // Load the plugin module
    let pluginModule: Record<string, unknown>;

    try {
      const mod = await import(data.pluginPath);
      pluginModule = mod;
    } catch (loadErr) {
      const msg: SandboxedWorkerMessage = {
        type: 'error',
        error: `Failed to load plugin module: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`,
      };
      parentPort.postMessage(msg);
      return;
    }

    // Get the plugin export
    const exported = pluginModule.default ?? pluginModule[data.pluginId] ?? pluginModule;
    if (!isPlugin(exported)) {
      const msg: SandboxedWorkerMessage = {
        type: 'error',
        error: 'Plugin does not satisfy the Plugin interface',
      };
      parentPort.postMessage(msg);
      return;
    }

    // Validate the manifest matches
    if (exported.manifest.id !== data.manifest.id) {
      const msg: SandboxedWorkerMessage = {
        type: 'error',
        error: `Plugin ID mismatch: expected "${data.manifest.id}", got "${exported.manifest.id}"`,
      };
      parentPort.postMessage(msg);
      return;
    }

    // Check plugin.supports() — this is a quick check before we register
    try {
      const supported = exported.supports(data.fingerprint);
      if (!supported) {
        const msg: SandboxedWorkerMessage = {
          type: 'error',
          error: 'Plugin does not support this project fingerprint',
        };
        parentPort.postMessage(msg);
        return;
      }
    } catch (supportErr) {
      const msg: SandboxedWorkerMessage = {
        type: 'error',
        error: `Plugin supports() threw: ${supportErr instanceof Error ? supportErr.message : String(supportErr)}`,
      };
      parentPort.postMessage(msg);
      return;
    }

    // Success — send plugin back to main thread
    const exportsCopy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pluginModule)) {
      if (typeof v !== 'function' && typeof v !== 'object') {
        exportsCopy[k] = v;
      }
      // Don't send functions/objects — they may contain closures with Node.js references
    }

    const msg: SandboxedWorkerMessage = {
      type: 'success',
      plugin: exported as unknown as undefined, // Plugins are not clonable — we rely on the module being re-importable
      exports: exportsCopy,
    };
    parentPort.postMessage(msg);
  } catch (err) {
    const msg: SandboxedWorkerMessage = {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort.postMessage(msg);
  }
}

main().catch((err) => {
  if (parentPort) {
    parentPort.postMessage({ type: 'error', error: String(err) } as SandboxedWorkerMessage);
  }
});
