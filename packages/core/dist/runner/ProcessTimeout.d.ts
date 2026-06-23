/**
 * ProcessTimeout — timeout wrapper for child processes.
 */
import { type ChildProcess } from 'child_process';
export interface TimeoutOptions {
    /** Timeout in milliseconds */
    timeoutMs: number;
    /** Called when timeout is approaching (optional graceful period) */
    onApproaching?: (remainingMs: number) => void;
    /** Grace period before hard kill (default 5000ms) */
    gracePeriodMs?: number;
}
/**
 * Wait for a process to exit, with optional timeout.
 * Resolves with the exit code when the process exits.
 * Rejects if timeout is exceeded.
 */
export declare function waitForExit(proc: ChildProcess, options: TimeoutOptions): Promise<{
    code: number | null;
    signal: string | null;
}>;
export declare class ProcessTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(message: string, timeoutMs: number);
}
/**
 * Run a command with a timeout. Wrapper around child_process.spawn.
 */
export declare function runWithTimeout(command: string, args: string[], options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    signal?: AbortSignal;
} & TimeoutOptions): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
}>;
//# sourceMappingURL=ProcessTimeout.d.ts.map