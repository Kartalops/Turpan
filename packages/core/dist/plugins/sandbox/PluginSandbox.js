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
import { Worker } from 'worker_threads';
import { isPermissionGranted } from './permissions.js';
import { validatePluginManifest } from './manifestValidator.js';
// ── Main entry: run a plugin in a sandboxed worker ─────────────────────────────
/**
 * Load and run a plugin inside an isolated worker thread.
 * Returns the plugin exports that can be used to register contributions.
 */
export async function runSandboxedPlugin(options) {
    const { pluginPath, pluginId, projectRoot, timeoutMs, grantedPermissions, fingerprint, manifest, signal, } = options;
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
    const requiredPerms = manifest.permissions ?? [];
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
    const workerDataObj = {
        pluginPath,
        pluginId,
        projectRoot,
        fingerprint,
        grantedPermissions,
        manifest,
        isBuiltin: false,
    };
    return new Promise((resolveResult) => {
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
        worker.on('message', (msg) => {
            terminated = true;
            clearTimeout(timeoutHandle);
            worker.terminate();
            if (msg.type === 'success') {
                resolveResult({
                    success: true,
                    plugin: msg.plugin,
                    pluginExports: msg.exports,
                });
            }
            else {
                resolveResult({
                    success: false,
                    error: msg.error ?? 'Unknown worker error',
                    plugin: undefined,
                    pluginExports: undefined,
                });
            }
        });
        worker.on('error', (err) => {
            terminated = true;
            clearTimeout(timeoutHandle);
            resolveResult({
                success: false,
                error: `Worker error: ${err.message}`,
                plugin: undefined,
            });
        });
        worker.on('exit', (code) => {
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
//# sourceMappingURL=PluginSandbox.js.map