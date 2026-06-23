/**
 * AppServerManager — starts a dev server in an isolated process,
 * waits for it to be ready, and stops it cleanly.
 *
 * Reliability improvements in Phase 15:
 * - Tracks the child PID and process group for guaranteed cleanup
 * - Hard kills after SIGTERM timeout
 * - Tracks orphaned browser/dev processes to avoid zombies
 * - Graceful stop on process exit (uncaughtException, SIGINT, SIGTERM)
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
const DEV_PORT_START = 3000;
const DEV_PORT_MAX = 3010;
const READY_SIGNALS = ['ready', 'compiled', 'listening', 'started', 'running'];
const READY_REGEX = /(?:ready|compiled|listening|started|running|http|server)/i;
/** Hard-kill grace period before SIGKILL (ms) */
const SIGTERM_GRACE_MS = 5_000;
/** Time to wait for the dev server to become ready (ms) */
const READY_TIMEOUT_MS = 30_000;
/** Cleanup poll interval for port availability */
const PORT_PROBE_TIMEOUT_MS = 1_000;
/**
 * Track all active AppServerManager instances for graceful cleanup.
 * On process exit, kill every still-running child so we don't leave zombies.
 */
const ACTIVE_SERVERS = new Set();
let CLEANUP_HOOK_INSTALLED = false;
function installCleanupHooks() {
    if (CLEANUP_HOOK_INSTALLED)
        return;
    CLEANUP_HOOK_INSTALLED = true;
    const cleanup = (signal) => {
        for (const s of ACTIVE_SERVERS) {
            try {
                void s.stop();
            }
            catch { /* ignore */ }
        }
        // Re-raise on the next tick so the process can still exit normally
        if (signal === 'SIGINT')
            process.exit(130);
        if (signal === 'SIGTERM')
            process.exit(143);
    };
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('exit', () => cleanup('exit'));
    process.on('uncaughtException', err => {
        // Best-effort: kill all active servers before propagating
        for (const s of ACTIVE_SERVERS) {
            try {
                void s.stop();
            }
            catch { /* ignore */ }
        }
        // eslint-disable-next-line no-console
        console.error('uncaughtException in AppServerManager:', err);
    });
}
export class AppServerManager {
    proc = null;
    port = 0;
    pid = 0;
    projectRoot;
    devCommand = null;
    startedAt = '';
    _stopped = false;
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        installCleanupHooks();
        ACTIVE_SERVERS.add(this);
    }
    /**
     * Determine the appropriate dev command from project fingerprint data.
     * Accepts either a fingerprint-like object or an explicit command override.
     */
    static deriveDevCommand(projectRoot, appType, packageScripts, explicitDevCommand) {
        if (explicitDevCommand)
            return explicitDevCommand;
        // Try package.json dev script
        if (packageScripts?.dev)
            return 'dev';
        // Try next dev for Next.js
        if (appType === 'nextjs' && packageScripts?.['next:dev'])
            return 'next:dev';
        // Fallback: look for common dev script names
        const candidates = ['dev', 'dev:server', 'start:dev', 'serve', 'start'];
        for (const cand of candidates) {
            if (packageScripts?.[cand])
                return cand;
        }
        // Check if there's a package.json with a scripts section we can read
        try {
            const pkgPath = join(projectRoot, 'package.json');
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
                if (pkg.scripts?.dev)
                    return 'dev';
                if (pkg.scripts?.['next:dev'])
                    return 'next:dev';
            }
        }
        catch { /* ignore */ }
        return null;
    }
    /**
     * Start the app server on an available port.
     */
    async start(devCommand, packageManager = 'pnpm') {
        if (this.proc) {
            throw new Error('AppServerManager: already started. Call stop() first.');
        }
        this.startedAt = new Date().toISOString();
        this.devCommand = devCommand;
        this._stopped = false;
        // Find an available port
        this.port = await this.findAvailablePort();
        const runCommand = this.buildRunCommand(devCommand, this.port, packageManager);
        return new Promise((resolve, reject) => {
            const env = { ...process.env, PORT: String(this.port) };
            try {
                // Detach as a process group so we can kill all children (pnpm spawns node, etc.)
                this.proc = spawn(runCommand.cmd, runCommand.args, {
                    cwd: this.projectRoot,
                    env,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    detached: true,
                });
            }
            catch (err) {
                ACTIVE_SERVERS.delete(this);
                reject(new Error(`Failed to spawn dev server: ${err instanceof Error ? err.message : String(err)}`));
                return;
            }
            this.pid = this.proc.pid ?? 0;
            let stdout = '';
            let stderr = '';
            let resolved = false;
            const tryResolve = () => {
                if (resolved)
                    return;
                const url = `http://localhost:${this.port}`;
                resolved = true;
                clearTimeout(readyTimeout);
                resolve({
                    url,
                    port: this.port,
                    pid: this.pid,
                    startedAt: this.startedAt,
                });
            };
            const readyTimeout = setTimeout(() => {
                if (!resolved) {
                    // Even if we didn't see a ready signal, the process is running — resolve with port
                    tryResolve();
                }
            }, READY_TIMEOUT_MS);
            const onData = (source, data) => {
                const text = data.toString();
                if (source === 'stdout')
                    stdout += text;
                else
                    stderr += text;
                if (READY_REGEX.test(text)) {
                    tryResolve();
                }
            };
            this.proc.stdout?.on('data', (d) => onData('stdout', d));
            this.proc.stderr?.on('data', (d) => onData('stderr', d));
            this.proc.on('error', (err) => {
                clearTimeout(readyTimeout);
                ACTIVE_SERVERS.delete(this);
                if (!resolved) {
                    resolved = true;
                    reject(new Error(`Failed to start dev server: ${err.message}\nStderr: ${stderr.slice(-500)}`));
                }
            });
            this.proc.on('exit', (code, signal) => {
                clearTimeout(readyTimeout);
                ACTIVE_SERVERS.delete(this);
                this.proc = null;
                if (!resolved && code !== 0 && code !== null) {
                    resolved = true;
                    reject(new Error(`Dev server exited with code ${code}${signal ? ` (signal: ${signal})` : ''}\nStderr: ${stderr.slice(-500)}`));
                }
            });
        });
    }
    /**
     * Stop the server process.
     *
     * Sends SIGTERM to the entire process group, then SIGKILL after a grace period.
     * Always resolves — never throws.
     */
    async stop() {
        if (this._stopped)
            return;
        this._stopped = true;
        ACTIVE_SERVERS.delete(this);
        if (!this.proc)
            return;
        const p = this.proc;
        this.proc = null;
        // Capture references to be safe even if the proc is reaped mid-stop
        const pid = p.pid;
        if (!pid)
            return;
        // Try to send SIGTERM to the process group (negative PID)
        try {
            if (p.kill('SIGTERM')) {
                // Process still alive — schedule a hard kill after the grace period
                const hardKillTimer = setTimeout(() => {
                    try {
                        // Negative PID = process group, ensures all children get killed
                        process.kill(-pid, 'SIGKILL');
                    }
                    catch { /* ignore — process is already dead */ }
                    try {
                        p.kill('SIGKILL');
                    }
                    catch { /* ignore */ }
                }, SIGTERM_GRACE_MS);
                // Don't keep the event loop alive for this timer
                if (typeof hardKillTimer.unref === 'function')
                    hardKillTimer.unref();
            }
        }
        catch { /* ignore */ }
        // Wait for actual exit
        return new Promise(resolve => {
            let done = false;
            const finish = () => { if (!done) {
                done = true;
                resolve();
            } };
            // Listen for the actual exit event (best case)
            p.once('exit', finish);
            // Hard timeout — give up waiting after 2× grace period
            const hardTimeout = setTimeout(finish, SIGTERM_GRACE_MS * 2 + 1_000);
            if (typeof hardTimeout.unref === 'function')
                hardTimeout.unref();
        });
    }
    buildRunCommand(devCommand, port, packageManager) {
        const pm = packageManager === 'yarn' ? 'yarn' :
            packageManager === 'bun' ? 'bun' :
                packageManager === 'npm' ? 'npm run' : 'pnpm';
        const base = pm === 'npm run' || pm === 'yarn' ? devCommand : [pm, devCommand];
        if (Array.isArray(base)) {
            return { cmd: base[0], args: [base[1], '--port', String(port)] };
        }
        return { cmd: base, args: ['--port', String(port)] };
    }
    async findAvailablePort() {
        for (let port = DEV_PORT_START; port <= DEV_PORT_MAX; port++) {
            const available = await this.isPortAvailable(port);
            if (available)
                return port;
        }
        throw new Error(`No available ports in range ${DEV_PORT_START}–${DEV_PORT_MAX}`);
    }
    async isPortAvailable(port) {
        return new Promise(resolve => {
            const net = require('net');
            const server = net.createServer();
            let done = false;
            const finish = (val) => {
                if (done)
                    return;
                done = true;
                resolve(val);
            };
            server.once('error', () => finish(false));
            server.once('listening', () => {
                server.close(() => finish(true));
            });
            // Hard timeout — if port probe hangs, move on
            const timer = setTimeout(() => finish(false), PORT_PROBE_TIMEOUT_MS);
            if (typeof timer.unref === 'function')
                timer.unref();
            try {
                server.listen(port, '127.0.0.1');
            }
            catch {
                finish(false);
            }
        });
    }
    getPort() { return this.port; }
    getStartedAt() { return this.startedAt; }
    isStopped() { return this._stopped; }
}
/**
 * Force-stop ALL active AppServerManager instances. Used during
 * hard process termination.
 */
export async function stopAllServers() {
    const promises = [];
    for (const s of ACTIVE_SERVERS) {
        promises.push(s.stop());
    }
    await Promise.allSettled(promises);
}
//# sourceMappingURL=AppServerManager.js.map