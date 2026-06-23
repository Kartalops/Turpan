/**
 * Per-process rate limiter for MCP tool calls.
 *
 * Security properties:
 * - Prevents abuse by limiting how many calls a single MCP client
 *   (or the process as a whole) can make per minute.
 * - Per-tool limits can be set individually.
 * - Configurable via CLI flags.
 * - Structured errors with retryAfterMs and current limits for observability.
 */
interface RateLimitConfig {
    /** Global max calls per minute for this process */
    globalMaxPerMinute: number;
    /** Per-tool max calls per minute (overrides global) */
    perToolMaxPerMinute?: Record<string, number>;
    /** Window size in milliseconds (default 60_000 = 1 minute) */
    windowMs?: number;
}
declare class RateLimiter {
    private global;
    private perTool;
    private config;
    constructor(config: RateLimitConfig);
    /**
     * Check if a call to `toolName` is allowed under the rate limit.
     * Returns null if allowed; returns a RateLimitError if rejected.
     */
    check(toolName: string): RateLimitError | null;
    /**
     * Record a call to `toolName`. Must be called after a successful check.
     */
    record(toolName: string): void;
    /**
     * Get current utilization snapshot (for status commands).
     */
    status(): {
        globalUsed: number;
        globalLimit: number;
        toolUsed: Map<string, number>;
        toolLimits: Map<string, number>;
    };
    /**
     * Write a rate limit event to the audit log.
     */
    private writeRateLimitAuditEvent;
    /**
     * Update the rate limit config dynamically.
     */
    updateConfig(config: Partial<RateLimitConfig>): void;
    /**
     * Get current configuration.
     */
    getConfig(): RateLimitConfig;
    private gcEntry;
}
declare class RateLimitError extends Error {
    readonly code = "RATE_LIMIT_EXCEEDED";
    readonly limit: number;
    readonly windowMs: number;
    readonly retryAfterMs: number;
    readonly toolName?: string;
    readonly currentUsed?: number;
    constructor(code: string, message: string, details: {
        limit: number;
        windowMs: number;
        retryAfterMs: number;
        toolName?: string;
        currentUsed?: number;
    });
    toJSON(): {
        error: {
            code: string;
            message: string;
            retryAfterMs: number;
            limit: number;
            windowMs: number;
            toolName: string | undefined;
            currentUsed: number | undefined;
        };
    };
}
/** Default rate limit config used when no flags are passed. */
declare const DEFAULT_RATE_LIMIT: RateLimitConfig;

/**
 * Tool call timeout guards — enforces per-tool timeout limits.
 *
 * Default timeouts:
 * - review_project: 5 minutes (300_000ms)
 * - review_diff: 5 minutes (300_000ms)
 * - live_ui_test: 5 minutes (300_000ms)
 * - agent_output_audit: 5 minutes (300_000ms)
 * - fix_findings: 5 minutes (300_000ms)
 * - get_report: 2 minutes (120_000ms)
 * - get_findings: 2 minutes (120_000ms)
 */
interface TimeoutConfig {
    timeouts: Record<string, number>;
}
declare const DEFAULT_TIMEOUTS: TimeoutConfig;
/**
 * TimeoutError thrown when a tool call exceeds its time limit.
 */
declare class ToolTimeoutError extends Error {
    readonly code = "TOOL_TIMEOUT";
    readonly toolName: string;
    readonly maxMs: number;
    constructor(toolName: string, maxMs: number);
}
/**
 * Wrap an async function with a timeout. Throws ToolTimeoutError on timeout.
 */
declare function withTimeout<T>(toolName: string, maxMs: number, fn: () => Promise<T>): Promise<T>;
/**
 * Get the configured timeout for a tool, falling back to 5 minutes.
 */
declare function getTimeoutForTool(toolName: string, config: TimeoutConfig): number;

/**
 * MCP Audit Logger — structured audit log for every MCP tool call.
 *
 * Security properties:
 * - Every tool call is logged with timestamp, tool name, projectPath,
 *   workspace, session/caller id, input summary (secrets redacted),
 *   output summary, status, duration, and runId.
 * - Written to .turpan/mcp-audit.log (global) and
 *   .turpan/runs/<runId>/mcp-audit.jsonl (workspace-scoped).
 * - Secrets are redacted before logging.
 * - Log rotation with configurable max size, max files, and daily rotation.
 */
type AuditStatus = 'success' | 'failure' | 'rejected' | 'timeout';
interface AuditLogConfig {
    /** Max size in MB before rotation (default: 10) */
    maxSizeMb?: number;
    /** Max number of rotated files to keep (default: 5) */
    maxFiles?: number;
    /** Enable daily rotation (default: false) */
    dailyRotation?: boolean;
}
interface RunIndexEntry {
    runId: string;
    tool: string;
    projectPath: string;
    status: AuditStatus;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    verdict?: string;
    summaryPath?: string;
}
/**
 * Configure the global audit log path and rotation settings.
 * Call once at server startup.
 */
declare function setGlobalAuditPath(projectPath: string, config?: AuditLogConfig): void;
/**
 * Configure audit log rotation parameters.
 */
declare function setAuditLogConfig(config: AuditLogConfig): void;
/**
 * Get current audit log configuration.
 */
declare function getAuditLogConfig(): AuditLogConfig;
/**
 * Get the audit log path.
 */
declare function getAuditLogPath(): string | null;
/**
 * Generate a new runId for this session.
 */
declare function generateRunId(): string;
/**
 * Create an audit context — tracks start time and produces final entry.
 */
declare class AuditContext {
    private readonly startTime;
    private readonly entry;
    constructor(params: {
        toolName: string;
        projectPath: string;
        workspace: string;
        sessionId?: string;
        callerId?: string;
        runId?: string;
        input: Record<string, unknown>;
    });
    /**
     * Record a rejected call (rate limit, validation failure, etc.)
     */
    reject(reason: string, errorCode?: string): void;
    /**
     * Record a timeout.
     */
    timeout(maxMs: number): void;
    /**
     * Record a failure (thrown error).
     */
    fail(errorMessage: string, errorCode?: string): void;
    /**
     * Record success with output summary.
     */
    succeed(outputSummary: string): void;
    private finalize;
    private updateRunIndex;
}
/**
 * Get recent runs from the run index.
 */
declare function getRecentRuns(projectPath: string, limit?: number): RunIndexEntry[];
/**
 * Get last error from audit log.
 */
declare function getLastError(projectPath: string): string | null;

/**
 * Concurrency guard — prevents multiple simultaneous review runs
 * in the same workspace, with stale lock detection and auto-release.
 *
 * Security properties:
 * - Only one active review per workspace at a time.
 * - Additional concurrent calls return a structured "busy" response
 *   with the current run id.
 * - Stale locks (from crashed processes) are auto-released after
 *   timeout + grace period.
 * - Stale releases write to audit log (best-effort, non-fatal).
 */
interface ActiveRun {
    runId: string;
    startedAt: string;
    toolName: string;
    expiresAt?: string;
}
interface StaleReleaseEvent {
    /** Workspace where the stale lock was released */
    workspace: string;
    /** Run ID that was released */
    runId: string;
    /** Tool that was running */
    toolName: string;
    /** When the lock was originally acquired */
    startedAt: string;
    /** When the lock was originally set to expire */
    expiresAt: string;
    /** When the lock was actually released (ISO 8601) */
    releasedAt: string;
    /** Why the lock was released ('stale_timeout' | 'grace_expired' | 'manual') */
    reason: 'stale_timeout' | 'grace_expired' | 'manual';
    /** Total time the lock was held in milliseconds */
    heldMs: number;
}
interface ConcurrencyGuardConfig {
    /** Default timeout in ms before a lock is considered stale (default: 5 minutes) */
    staleTimeoutMs?: number;
    /** Grace period in ms after stale detection before auto-release (default: 30 seconds) */
    gracePeriodMs?: number;
    /** Callback for stale release events (used by audit logger integration) */
    onStaleRelease?: (event: StaleReleaseEvent) => void;
    /** Callback for manual release events */
    onManualRelease?: (event: StaleReleaseEvent) => void;
}
declare class ConcurrencyGuard {
    /** workspace root → active run info */
    private activeRuns;
    private config;
    constructor(config?: ConcurrencyGuardConfig);
    /**
     * Try to claim an active run slot for `workspace`.
     * Returns null if the slot is free; returns the existing ActiveRun if busy.
     * Stale locks are cleaned up before checking.
     */
    tryClaim(workspace: string, runId: string, toolName: string): ActiveRun | null;
    /**
     * Check if a workspace has an active run (without claiming it).
     * Stale locks are cleaned up first.
     */
    getActiveRun(workspace: string): ActiveRun | undefined;
    /**
     * Release the active run slot for `workspace`.
     */
    release(workspace: string): void;
    /**
     * Release by runId (useful when a run completes with a known runId).
     */
    releaseByRunId(runId: string): void;
    /**
     * Release by runId with a reason (for audit logging).
     * Returns the released run info if found.
     */
    releaseByRunIdWithReason(runId: string, reason: string): ActiveRun | null;
    /**
     * Get all currently active runs (without cleanup).
     */
    getAllActiveRuns(): Map<string, ActiveRun>;
    /**
     * Get the current configuration.
     */
    getConfig(): ConcurrencyGuardConfig;
    /**
     * Detect and auto-release stale locks.
     * A lock is stale if it has exceeded its expiry time + grace period.
     * Returns the list of stale workspaces that were cleaned up.
     */
    cleanupStaleLocks(): string[];
    /**
     * Fire a release event to the configured callback (for audit logging).
     * Never throws — best-effort.
     */
    private fireReleaseEvent;
    /**
     * Check if a specific workspace has a stale lock (for status reporting).
     */
    isStale(workspace: string): boolean;
    /**
     * Get time until a workspace lock expires (for status reporting).
     * Returns null if no active lock.
     */
    getTimeUntilExpiry(workspace: string): number | null;
}

/**
 * Turpan MCP Server — CLI entry point.
 *
 * Usage:
 *   turpan mcp serve              # Start MCP server on stdio
 *   turpan mcp serve --workspace ./my-project  # Scoped to project
 *   turpan mcp serve --max-calls-per-minute 60 --max-tool-calls-per-minute 20
 *   turpan mcp serve --audit-max-size-mb 10 --audit-max-files 5
 *   turpan mcp serve --stale-lock-timeout-ms 300000 --stale-lock-grace-ms 30000
 *   turpan mcp config             # Show MCP configuration for Claude Code
 *   turpan mcp status            # Check MCP server status
 */

declare function runMcpCommand(argv: string[]): Promise<void>;

export { type ActiveRun, AuditContext, type AuditLogConfig, ConcurrencyGuard, type ConcurrencyGuardConfig, DEFAULT_RATE_LIMIT, DEFAULT_TIMEOUTS, type RateLimitConfig, RateLimitError, RateLimiter, type RunIndexEntry, type TimeoutConfig, ToolTimeoutError, generateRunId, getAuditLogConfig, getAuditLogPath, getLastError, getRecentRuns, getTimeoutForTool, runMcpCommand, setAuditLogConfig, setGlobalAuditPath, withTimeout };
