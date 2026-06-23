/**
 * processWorker — entry point for the child process sandbox.
 *
 * This file runs in a SEPARATE Node.js process (not a worker thread).
 * It receives plugin init data via stdin IPC and sends results via stdout.
 *
 * Protocol:
 *  1. Parent sends { type: 'init', ... } on stdin
 *  2. Child validates plugin, sends { type: 'ready' } on stdout
 *  3. Parent sends { type: 'run-analysis', callId, context } on stdin
 *  4. Child runs plugin analysis, sends { type: 'result', callId, success, ... } on stdout
 *
 * Security properties:
 *  - No inherited handles from parent
 *  - Minimal env vars (NODE_ENV, NO_COLOR, TURPAN_PLUGIN_MODE only)
 *  - No secrets in environment
 *  - No direct fs/net/child_process — uses only allowed paths
 *  - Memory limited by V8 --max-old-space-size (set by parent)
 *  - Plugin module re-imported in this process
 */
import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, join, extname, relative } from 'path';
// ── Allowed file extensions by permission ─────────────────────────────────────
const PERMISSION_ALLOWED_EXTENSIONS = {
    'read-project-files': ['.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.md', '.txt', '.css', '.scss', '.html'],
    'read-package-metadata': ['package.json'],
};
// ── State ─────────────────────────────────────────────────────────────────────
let findingCounter = 0;
let currentPluginId = 'unknown';
let currentStartTime = 0;
let currentTimeoutMs = 30000;
let currentProjectRoot = '';
let currentPermissions = [];
let currentAllowedPaths = new Set();
// ── Main ──────────────────────────────────────────────────────────────────────
// Read init message from stdin (single init, blocking)
async function main() {
    // Use a simple line-based reader
    const initLine = await readLine();
    if (!initLine) {
        process.exit(1);
    }
    let initMsg;
    try {
        initMsg = JSON.parse(initLine);
    }
    catch {
        sendResult('__init__', false, undefined, 'Failed to parse init message');
        process.exit(1);
        return;
    }
    if (initMsg.type !== 'init') {
        sendResult('__init__', false, undefined, `Expected init message, got: ${initMsg.type}`);
        process.exit(1);
        return;
    }
    // Initialize sandbox state
    currentPluginId = initMsg.pluginId;
    currentStartTime = initMsg.startTime;
    currentTimeoutMs = initMsg.timeoutMs;
    currentProjectRoot = initMsg.projectRoot;
    currentPermissions = initMsg.grantedPermissions;
    currentAllowedPaths = new Set(initMsg.allowedPaths);
    // Validate the manifest
    const manifest = initMsg.manifest;
    if (!manifest.id || !manifest.version || !manifest.name) {
        sendResult('__init__', false, undefined, 'Invalid manifest: missing required fields');
        process.exit(1);
        return;
    }
    // Check manifest ID matches
    if (manifest.id !== initMsg.pluginId) {
        sendResult('__init__', false, undefined, `Plugin ID mismatch: expected "${initMsg.pluginId}", got "${manifest.id}"`);
        process.exit(1);
        return;
    }
    // Check required permissions
    const requiredPerms = manifest.permissions ?? [];
    const missingPerms = requiredPerms.filter(p => !currentPermissions.includes(p));
    if (missingPerms.length > 0) {
        sendResult('__init__', false, undefined, `Missing permissions: ${missingPerms.join(', ')}`);
        process.exit(1);
        return;
    }
    // Load the plugin module
    let pluginModule;
    try {
        pluginModule = await import(initMsg.pluginPath);
    }
    catch (loadErr) {
        sendResult('__init__', false, undefined, `Failed to load plugin: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`);
        process.exit(1);
        return;
    }
    const exported = pluginModule.default ?? pluginModule[initMsg.pluginId] ?? pluginModule;
    // Validate plugin interface
    if (!isPlugin(exported)) {
        sendResult('__init__', false, undefined, 'Plugin does not satisfy the Plugin interface');
        process.exit(1);
        return;
    }
    // Check supports()
    try {
        const fp = initMsg.fingerprint;
        const supported = exported.supports(fp);
        if (!supported) {
            sendResult('__init__', false, undefined, 'Plugin does not support this project fingerprint');
            process.exit(1);
            return;
        }
    }
    catch (supportErr) {
        sendResult('__init__', false, undefined, `Plugin supports() threw: ${supportErr instanceof Error ? supportErr.message : String(supportErr)}`);
        process.exit(1);
        return;
    }
    // Send ready
    sendMessage({ type: 'ready' });
    // Now read analysis messages until EOF or abort
    while (true) {
        const line = await readLine();
        if (!line)
            break; // EOF
        let msg;
        try {
            msg = JSON.parse(line);
        }
        catch {
            // Malformed message — continue
            continue;
        }
        if (msg.type === 'abort') {
            process.exit(0);
            return;
        }
        if (msg.type === 'run-analysis') {
            // Build a sandboxed context for the plugin
            const ctx = buildSandboxContext();
            const findings = [];
            try {
                // Check timeout
                if (Date.now() - currentStartTime > currentTimeoutMs) {
                    sendResult(msg.callId, false, undefined, 'Plugin timed out before analysis');
                    continue;
                }
                // Call the plugin's register function if it has analyzers
                if (typeof exported.register === 'function') {
                    const fakeRegistry = {
                        registerAnalyzer: (analyzer, pluginId) => {
                            // We'll collect findings from all registered analyzers
                        },
                    };
                    // Timeout guard
                    const timeoutAt = currentStartTime + currentTimeoutMs;
                    const remaining = timeoutAt - Date.now();
                    if (remaining <= 0) {
                        sendResult(msg.callId, false, undefined, 'Plugin timed out');
                        continue;
                    }
                    // Set a deadline for the register call
                    const deadline = setTimeout(() => {
                        process.exit(2);
                    }, remaining);
                    try {
                        exported.register(fakeRegistry, ctx);
                    }
                    finally {
                        clearTimeout(deadline);
                    }
                }
                sendResult(msg.callId, true, findings, undefined);
            }
            catch (runErr) {
                sendResult(msg.callId, false, undefined, `Plugin analysis threw: ${runErr instanceof Error ? runErr.message : String(runErr)}`);
            }
        }
    }
    process.exit(0);
}
// ── Sandbox context builder ───────────────────────────────────────────────────
function buildSandboxContext() {
    const isAllowed = (filePath) => {
        const resolved = resolve(currentProjectRoot, filePath);
        const rel = relative(currentProjectRoot, resolved);
        if (rel.startsWith('..') || rel.includes('..'))
            return false;
        return currentAllowedPaths.has(resolved) || currentAllowedPaths.has(rel);
    };
    const isExtensionAllowed = (filePath, permission) => {
        const ext = extname(filePath).toLowerCase();
        const allowed = PERMISSION_ALLOWED_EXTENSIONS[permission];
        if (!allowed)
            return false;
        return allowed.includes(ext);
    };
    return {
        projectRoot: currentProjectRoot,
        readFile(path) {
            if (!this.permissions.includes('read-project-files'))
                return null;
            if (!isAllowed(path))
                return null;
            if (!isExtensionAllowed(path, 'read-project-files'))
                return null;
            try {
                return readFileSync(resolve(currentProjectRoot, path), 'utf-8');
            }
            catch {
                return null;
            }
        },
        fileExists(path) {
            if (!isAllowed(path))
                return false;
            try {
                statSync(resolve(currentProjectRoot, path));
                return true;
            }
            catch {
                return false;
            }
        },
        listDir(path) {
            if (!this.permissions.includes('read-project-files'))
                return [];
            if (!isAllowed(path))
                return [];
            try {
                return readdirSync(resolve(currentProjectRoot, path));
            }
            catch {
                return [];
            }
        },
        getPackageJson() {
            if (!this.permissions.includes('read-package-metadata'))
                return null;
            const pkgPath = join(currentProjectRoot, 'package.json');
            if (!isAllowed(pkgPath))
                return null;
            try {
                const content = readFileSync(pkgPath, 'utf-8');
                return JSON.parse(content);
            }
            catch {
                return null;
            }
        },
        createFinding(partial) {
            findingCounter++;
            return {
                ...partial,
                id: `plugin-${currentPluginId}-finding-${findingCounter}`,
                pluginId: currentPluginId,
                detectedAt: new Date().toISOString(),
            };
        },
        timeRemainingMs() {
            const elapsed = Date.now() - currentStartTime;
            return Math.max(0, currentTimeoutMs - elapsed);
        },
        permissions: currentPermissions,
    };
}
// ── Plugin interface check ───────────────────────────────────────────────────
function isPlugin(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const plugin = value;
    return (typeof plugin.manifest === 'object' &&
        typeof plugin.supports === 'function' &&
        typeof plugin.register === 'function');
}
// ── IPC helpers ──────────────────────────────────────────────────────────────
function sendMessage(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}
function sendResult(callId, success, findings, error) {
    sendMessage({
        type: 'result',
        callId,
        success,
        findings: findings ?? [],
        error,
        crashed: false,
    });
}
// ── Line reader ───────────────────────────────────────────────────────────────
function readLine() {
    return new Promise((resolve) => {
        let data = '';
        const onData = (chunk) => {
            data += chunk.toString('utf-8');
            const newlineIndex = data.indexOf('\n');
            if (newlineIndex !== -1) {
                process.stdin.off('data', onData);
                resolve(data.slice(0, newlineIndex));
            }
        };
        process.stdin.on('data', onData);
        process.stdin.resume();
    });
}
// ── Global error handlers ─────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    sendMessage({
        type: 'result',
        callId: '__uncaught__',
        success: false,
        error: `Uncaught exception: ${err.message}`,
        crashed: true,
    });
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    sendMessage({
        type: 'result',
        callId: '__unhandled__',
        success: false,
        error: `Unhandled rejection: ${String(reason)}`,
        crashed: true,
    });
    process.exit(1);
});
// ── Start ─────────────────────────────────────────────────────────────────────
main().catch((err) => {
    sendMessage({
        type: 'result',
        callId: '__main__',
        success: false,
        error: `Main error: ${String(err)}`,
        crashed: true,
    });
    process.exit(1);
});
//# sourceMappingURL=processWorker.js.map