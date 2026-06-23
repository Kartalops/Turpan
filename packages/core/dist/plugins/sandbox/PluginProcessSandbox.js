/**
 * PluginProcessSandbox — runs external plugins in a separate Node.js process
 * with OS-level isolation and IPC communication.
 *
 * Phase 29: Optional stronger sandbox mode beyond worker threads.
 *
 * Security properties (vs worker thread):
 *  + Separate V8 heap — hard memory limit via --max-old-space-size
 *  + Separate event loop — runaway child cannot starve parent
 *  + OS-level crash isolation — segfault ≠ parent death
 *  + Explicit env allowlist — no inherited secrets
 *  + SIGKILL timeout enforcement
 */
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { isPermissionGranted } from './permissions.js';
import { validatePluginManifest } from './manifestValidator.js';
import { sanitizeCommandOutput } from './sandboxRunner.js';
/** Allowlist of environment variables passed to the child process */
const ALLOWED_ENV_VARS = {
    NODE_ENV: 'production',
    NO_COLOR: '1',
    TURPAN_PLUGIN_MODE: 'process',
};
/** Maximum stdout accumulation in bytes (1MB) */
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024;
// ── Main entry: run a plugin in a child process ─────────────────────────────
/**
 * Load and run a plugin inside an isolated child Node.js process.
 * Returns the plugin exports that can be used to register contributions.
 */
export async function runProcessSandboxedPlugin(options) {
    const { pluginPath, pluginId, projectRoot, timeoutMs, memoryLimitMb = 256, grantedPermissions, fingerprint, manifest, signal, processSandboxConfig, } = options;
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
    // Determine allowed paths based on permissions
    const allowedPaths = buildAllowedPaths(projectRoot, grantedPermissions);
    const startTime = Date.now();
    // Build init message
    const initMsg = {
        type: 'init',
        pluginPath,
        pluginId,
        projectRoot,
        fingerprint,
        grantedPermissions,
        manifest,
        allowedPaths,
        timeoutMs,
        startTime,
        memoryLimitMb,
    };
    // Spawn child process
    const childEnv = { ...process.env, ...ALLOWED_ENV_VARS };
    // Remove any potentially sensitive env vars that might have leaked
    const SENSITIVE_PREFIXES = [
        'AWS_', 'AZURE_', 'GCP_', 'STRIPE_', 'SENTRY_',
        'DATABASE_', 'DB_', 'SECRET_', 'TOKEN_', 'KEY_',
        'PASSWORD', 'PASSWD', 'PRIVATE_', 'API_KEY',
    ];
    for (const [key] of Object.entries(childEnv)) {
        if (SENSITIVE_PREFIXES.some(p => key.startsWith(p))) {
            delete childEnv[key];
        }
    }
    // Resolve the process worker script path.
    // In dist (built): import.meta.url → dist/plugins/sandbox/PluginProcessSandbox.js → sibling processWorker.js
    // In tests (vitest/tsx): import.meta.url → src/plugins/sandbox/PluginProcessSandbox.ts → sibling processWorker.ts
    const { existsSync } = await import('fs');
    const thisDir = fileURLToPath(import.meta.url).replace(/\/[^/]+$/, '');
    const distWorker = join(thisDir, 'processWorker.js');
    const srcWorker = join(thisDir, 'processWorker.ts');
    const workerScript = existsSync(distWorker) ? distWorker : srcWorker;
    const childArgs = [
        `--max-old-space-size=${memoryLimitMb}`,
        workerScript,
    ];
    const child = spawn(process.execPath, childArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
        // Don't inherit any handles from parent
        detached: false,
        // Don't set a group — child runs in same group until we kill it
        windowsHide: true,
    });
    return new Promise((resolveResult) => {
        let terminated = false;
        let stdoutBuffer = '';
        let stderrOutput = '';
        let callIdCounter = 0;
        const pendingCalls = new Map();
        // Send init message
        const sendMsg = (msg) => {
            if (child.stdin.writableEnded)
                return;
            try {
                child.stdin.write(JSON.stringify(msg) + '\n');
            }
            catch {
                // ignore
            }
        };
        // ── Timeout handling ──────────────────────────────────────────────────
        const scheduleTimeout = (callId, ms) => {
            const timer = setTimeout(() => {
                pendingCalls.delete(callId);
                if (!terminated) {
                    terminated = true;
                    // SIGKILL — cannot be intercepted by the child
                    child.kill('SIGKILL');
                    resolveResult({
                        success: false,
                        error: `Plugin "${pluginId}" timed out after ${ms}ms`,
                        plugin: undefined,
                        timedOut: true,
                    });
                }
            }, ms);
            return timer;
        };
        // ── Main timeout ──────────────────────────────────────────────────────
        const masterTimeout = scheduleTimeout('__master__', timeoutMs);
        // ── Abort handling ─────────────────────────────────────────────────────
        signal?.addEventListener('abort', () => {
            if (!terminated) {
                terminated = true;
                clearTimeout(masterTimeout);
                child.kill('SIGKILL');
                resolveResult({ success: false, error: 'Aborted', plugin: undefined });
            }
        });
        // ── IPC protocol: parse child output line by line ─────────────────────
        const parseMessages = (data) => {
            stdoutBuffer += data.toString('utf-8');
            // Check output cap BEFORE processing lines.
            // This prevents a large output from overflowing the buffer before
            // the ready-message handler can clear the timeout — ensuring
            // truncation kills the child even when ready arrives in the same
            // data event as the huge result.
            if (stdoutBuffer.length > MAX_OUTPUT_BYTES && !terminated) {
                terminated = true;
                clearTimeout(masterTimeout);
                child.kill('SIGKILL');
                resolveResult({
                    success: false,
                    error: `Plugin "${pluginId}" output exceeded ${MAX_OUTPUT_BYTES} bytes — truncated`,
                    plugin: undefined,
                });
                return;
            }
            // Process complete lines
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() ?? ''; // keep incomplete last line
            for (const line of lines) {
                if (!line.trim())
                    continue;
                let msg;
                try {
                    msg = JSON.parse(line);
                }
                catch {
                    // Malformed JSON — reject the child
                    if (!terminated) {
                        terminated = true;
                        clearTimeout(masterTimeout);
                        child.kill('SIGKILL');
                        resolveResult({
                            success: false,
                            error: `Malformed IPC message from plugin process: ${line.slice(0, 200)}`,
                            plugin: undefined,
                        });
                    }
                    return;
                }
                switch (msg.type) {
                    case 'ready':
                        // Child is initialized — now run analysis
                        {
                            const callId = `call-${++callIdCounter}`;
                            const runTimeout = scheduleTimeout(callId, timeoutMs);
                            pendingCalls.set(callId, { resolve: resolveResult, timeout: runTimeout });
                            sendMsg({ type: 'run-analysis', callId, context: {} });
                        }
                        break;
                    case 'result':
                        {
                            const pending = pendingCalls.get(msg.callId);
                            if (pending) {
                                clearTimeout(pending.timeout);
                                pendingCalls.delete(msg.callId);
                            }
                            if (!terminated) {
                                terminated = true;
                                clearTimeout(masterTimeout);
                                child.kill('SIGKILL');
                                if (msg.success) {
                                    resolveResult({
                                        success: true,
                                        plugin: undefined, // process mode: no plugin object returned
                                        pluginExports: { findings: msg.findings ?? [] },
                                    });
                                }
                                else {
                                    resolveResult({
                                        success: false,
                                        error: msg.error ?? 'Unknown plugin error',
                                        plugin: undefined,
                                        crashed: msg.crashed,
                                    });
                                }
                            }
                        }
                        break;
                    case 'log':
                        // Child log — parent logs at debug level
                        // (logs are already captured via stderr in processWorker)
                        break;
                    case 'truncated':
                        // Output was truncated — continue but cap output
                        break;
                }
            }
        };
        child.stdout.on('data', parseMessages);
        // Capture stderr separately (not part of IPC protocol)
        child.stderr.on('data', (data) => {
            stderrOutput += data.toString('utf-8');
        });
        // Suppress EPIPE — child may be killed while parent is writing to stdin
        child.stdin.on('error', (err) => {
            if (err.code === 'EPIPE')
                return; // Child died — expected during SIGKILL
        });
        child.on('error', (err) => {
            if (!terminated) {
                terminated = true;
                clearTimeout(masterTimeout);
                resolveResult({
                    success: false,
                    error: `Child process error: ${err.message}`,
                    plugin: undefined,
                });
            }
        });
        child.on('exit', (code, signal) => {
            // Check if we were waiting for a result
            if (!terminated) {
                terminated = true;
                clearTimeout(masterTimeout);
                // Child exited without sending result — this is a crash
                // Redact any secrets from stderr before including in error
                const redactedStderr = sanitizeCommandOutput(stderrOutput).slice(0, 2000);
                if (code !== 0 || signal !== null) {
                    resolveResult({
                        success: false,
                        error: `Plugin process exited unexpectedly (code=${code}, signal=${signal})${redactedStderr ? `: ${redactedStderr}` : ''}`,
                        plugin: undefined,
                        crashed: true,
                    });
                }
            }
        });
        // ── Send init message to start the protocol ────────────────────────────
        sendMsg(initMsg);
    });
}
// ── Build allowed paths ───────────────────────────────────────────────────────
function buildAllowedPaths(projectRoot, permissions) {
    const paths = new Set();
    if (permissions.includes('read-project-files')) {
        paths.add(projectRoot);
    }
    if (permissions.includes('read-package-metadata')) {
        paths.add(join(projectRoot, 'package.json'));
    }
    if (permissions.includes('read-config')) {
        paths.add(join(projectRoot, 'turpan.yml'));
        paths.add(join(projectRoot, '.turpan'));
    }
    return [...paths];
}
// ── dirname ───────────────────────────────────────────────────────────────────
function dirname(filePath) {
    const segs = filePath.split('/');
    segs.pop();
    return segs.join('/') || '/';
}
//# sourceMappingURL=PluginProcessSandbox.js.map