/**
 * CommandResult — structured result of a safe command execution.
 */
/** Stage → Finding severity mapping */
export declare const STAGE_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'>;
export interface CommandResult {
    /** The command that was executed */
    command: string;
    /** Working directory */
    cwd: string;
    /** Exit code (null if process didn't exit normally) */
    exitCode: number | null;
    /** Signal that killed the process (if applicable) */
    signal: string | null;
    /** Raw stdout */
    stdout: string;
    /** Raw stderr */
    stderr: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Whether the command was blocked */
    blocked: boolean;
    /** If blocked, why */
    blockReason?: string;
    /** Severity of the block */
    blockSeverity?: 'critical' | 'high';
    /** Path to the saved log file (if saved) */
    logPath?: string;
    /** Whether the process timed out */
    timedOut: boolean;
}
export interface CommandRunOptions {
    /** Working directory (default: project root) */
    cwd?: string;
    /** Additional environment variables */
    env?: Record<string, string>;
    /** Timeout in milliseconds (default: 120000 = 2 min) */
    timeoutMs?: number;
    /** Signal for cancellation */
    signal?: AbortSignal;
    /** Save stdout/stderr to log file */
    saveLog?: boolean;
    /** Log directory (default: .turpan/runs/latest/logs) */
    logDir?: string;
    /** Stage name for log file naming */
    stageName?: string;
    /** Policy override — skip policy checks (use with caution) */
    skipPolicy?: boolean;
}
export interface CommandSummary {
    command: string;
    exitCode: number | null;
    timedOut: boolean;
    durationMs: number;
    blocked: boolean;
}
//# sourceMappingURL=CommandResult.d.ts.map