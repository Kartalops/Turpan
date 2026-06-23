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

export interface ActiveRun {
  runId: string;
  startedAt: string;           // ISO 8601 timestamp
  toolName: string;
  expiresAt?: string;         // When this lock should be considered stale
}

export interface StaleReleaseEvent {
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

export interface ConcurrencyGuardConfig {
  /** Default timeout in ms before a lock is considered stale (default: 5 minutes) */
  staleTimeoutMs?: number;
  /** Grace period in ms after stale detection before auto-release (default: 30 seconds) */
  gracePeriodMs?: number;
  /** Callback for stale release events (used by audit logger integration) */
  onStaleRelease?: (event: StaleReleaseEvent) => void;
  /** Callback for manual release events */
  onManualRelease?: (event: StaleReleaseEvent) => void;
}

const DEFAULT_STALE_TIMEOUT_MS = 5 * 60 * 1000;    // 5 minutes
const DEFAULT_GRACE_PERIOD_MS = 30 * 1000;          // 30 seconds

export class ConcurrencyGuard {
  /** workspace root → active run info */
  private activeRuns: Map<string, ActiveRun> = new Map();
  private config: {
    staleTimeoutMs: number;
    gracePeriodMs: number;
    onStaleRelease?: (event: StaleReleaseEvent) => void;
    onManualRelease?: (event: StaleReleaseEvent) => void;
  };

  constructor(config: ConcurrencyGuardConfig = {}) {
    this.config = {
      staleTimeoutMs: config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS,
      gracePeriodMs: config.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS,
      onStaleRelease: config.onStaleRelease,
      onManualRelease: config.onManualRelease,
    };
  }

  /**
   * Try to claim an active run slot for `workspace`.
   * Returns null if the slot is free; returns the existing ActiveRun if busy.
   * Stale locks are cleaned up before checking.
   */
  tryClaim(workspace: string, runId: string, toolName: string): ActiveRun | null {
    // Clean up stale locks before claiming
    this.cleanupStaleLocks();

    const existing = this.activeRuns.get(workspace);
    if (existing) {
      // Check if it's a stale lock that just got cleaned up
      const current = this.activeRuns.get(workspace);
      if (!current) return null;
      return current;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.staleTimeoutMs).toISOString();
    this.activeRuns.set(workspace, {
      runId,
      startedAt: now.toISOString(),
      toolName,
      expiresAt,
    });
    return null;
  }

  /**
   * Check if a workspace has an active run (without claiming it).
   * Stale locks are cleaned up first.
   */
  getActiveRun(workspace: string): ActiveRun | undefined {
    this.cleanupStaleLocks();
    return this.activeRuns.get(workspace);
  }

  /**
   * Release the active run slot for `workspace`.
   */
  release(workspace: string): void {
    const run = this.activeRuns.get(workspace);
    if (run) {
      this.fireReleaseEvent(workspace, run, 'manual');
    }
    this.activeRuns.delete(workspace);
  }

  /**
   * Release by runId (useful when a run completes with a known runId).
   */
  releaseByRunId(runId: string): void {
    for (const [workspace, run] of this.activeRuns) {
      if (run.runId === runId) {
        this.fireReleaseEvent(workspace, run, 'manual');
        this.activeRuns.delete(workspace);
        return;
      }
    }
  }

  /**
   * Release by runId with a reason (for audit logging).
   * Returns the released run info if found.
   */
  releaseByRunIdWithReason(runId: string, reason: string): ActiveRun | null {
    for (const [workspace, run] of this.activeRuns) {
      if (run.runId === runId) {
        this.activeRuns.delete(workspace);
        this.fireReleaseEvent(workspace, run, 'manual', reason);
        return run;
      }
    }
    return null;
  }

  /**
   * Get all currently active runs (without cleanup).
   */
  getAllActiveRuns(): Map<string, ActiveRun> {
    return new Map(this.activeRuns);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ConcurrencyGuardConfig {
    return { ...this.config };
  }

  /**
   * Detect and auto-release stale locks.
   * A lock is stale if it has exceeded its expiry time + grace period.
   * Returns the list of stale workspaces that were cleaned up.
   */
  cleanupStaleLocks(): string[] {
    const now = Date.now();
    const staleWorkspaces: string[] = [];

    for (const [workspace, run] of this.activeRuns) {
      if (!run.expiresAt) continue;
      const expiryMs = new Date(run.expiresAt).getTime();
      const graceEndMs = expiryMs + this.config.gracePeriodMs;
      if (now > graceEndMs) {
        // Determine the release reason:
        // - 'grace_expired' if past grace period (stale cleanup)
        // - 'stale_timeout' if past expiry but within grace (would only happen if checked manually)
        const reason: 'grace_expired' | 'stale_timeout' = 'grace_expired';
        this.fireReleaseEvent(workspace, run, reason);
        staleWorkspaces.push(workspace);
        this.activeRuns.delete(workspace);
      }
    }

    return staleWorkspaces;
  }

  /**
   * Fire a release event to the configured callback (for audit logging).
   * Never throws — best-effort.
   */
  private fireReleaseEvent(
    workspace: string,
    run: ActiveRun,
    reason: 'stale_timeout' | 'grace_expired' | 'manual',
    customReason?: string,
  ): void {
    const event: StaleReleaseEvent = {
      workspace,
      runId: run.runId,
      toolName: run.toolName,
      startedAt: run.startedAt,
      expiresAt: run.expiresAt ?? new Date().toISOString(),
      releasedAt: new Date().toISOString(),
      reason,
      heldMs: Date.now() - new Date(run.startedAt).getTime(),
    };

    const callback = reason === 'manual'
      ? this.config.onManualRelease
      : this.config.onStaleRelease;
    if (callback) {
      try {
        callback(event);
      } catch {
        // Non-fatal: callbacks must not crash the guard
      }
    }
  }

  /**
   * Check if a specific workspace has a stale lock (for status reporting).
   */
  isStale(workspace: string): boolean {
    const run = this.activeRuns.get(workspace);
    if (!run || !run.expiresAt) return false;
    const expiryMs = new Date(run.expiresAt).getTime();
    return Date.now() > expiryMs;
  }

  /**
   * Get time until a workspace lock expires (for status reporting).
   * Returns null if no active lock.
   */
  getTimeUntilExpiry(workspace: string): number | null {
    const run = this.activeRuns.get(workspace);
    if (!run || !run.expiresAt) return null;
    const expiryMs = new Date(run.expiresAt).getTime();
    return Math.max(0, expiryMs - Date.now());
  }
}
