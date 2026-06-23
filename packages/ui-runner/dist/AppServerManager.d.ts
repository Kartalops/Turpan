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
import type { AppServerInfo } from './types.js';
export declare class AppServerManager {
    private proc;
    private port;
    private pid;
    private projectRoot;
    private devCommand;
    private startedAt;
    private _stopped;
    constructor(projectRoot: string);
    /**
     * Determine the appropriate dev command from project fingerprint data.
     * Accepts either a fingerprint-like object or an explicit command override.
     */
    static deriveDevCommand(projectRoot: string, appType?: string, packageScripts?: Record<string, string>, explicitDevCommand?: string): string | null;
    /**
     * Start the app server on an available port.
     */
    start(devCommand: string, packageManager?: string): Promise<AppServerInfo>;
    /**
     * Stop the server process.
     *
     * Sends SIGTERM to the entire process group, then SIGKILL after a grace period.
     * Always resolves — never throws.
     */
    stop(): Promise<void>;
    private buildRunCommand;
    private findAvailablePort;
    private isPortAvailable;
    getPort(): number;
    getStartedAt(): string;
    isStopped(): boolean;
}
/**
 * Force-stop ALL active AppServerManager instances. Used during
 * hard process termination.
 */
export declare function stopAllServers(): Promise<void>;
//# sourceMappingURL=AppServerManager.d.ts.map