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

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { redactSecrets } from './redact.js';

export interface RateLimitConfig {
  /** Global max calls per minute for this process */
  globalMaxPerMinute: number;
  /** Per-tool max calls per minute (overrides global) */
  perToolMaxPerMinute?: Record<string, number>;
  /** Window size in milliseconds (default 60_000 = 1 minute) */
  windowMs?: number;
}

interface SlidingWindowEntry {
  count: number;
  windowStart: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const GLOBAL_AUDIT_PATH = '.turpan/mcp-audit.log';

export class RateLimiter {
  private global: SlidingWindowEntry = { count: 0, windowStart: Date.now() };
  private perTool: Map<string, SlidingWindowEntry> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      windowMs: config.windowMs ?? DEFAULT_WINDOW_MS,
    };
  }

  /**
   * Check if a call to `toolName` is allowed under the rate limit.
   * Returns null if allowed; returns a RateLimitError if rejected.
   */
  check(toolName: string): RateLimitError | null {
    const now = Date.now();
    const windowMs = this.config.windowMs!;

    // Check global limit
    this.gcEntry(this.global, now, windowMs);
    if (this.global.count >= this.config.globalMaxPerMinute) {
      const retryAfterMs = windowMs - (now - this.global.windowStart);
      const error = new RateLimitError(
        'RATE_LIMIT_EXCEEDED',
        `Global rate limit exceeded: ${this.config.globalMaxPerMinute} calls per minute`,
        {
          limit: this.config.globalMaxPerMinute,
          windowMs,
          retryAfterMs: Math.max(0, retryAfterMs),
          currentUsed: this.global.count,
        }
      );
      this.writeRateLimitAuditEvent(toolName, error);
      return error;
    }

    // Check per-tool limit
    const toolLimit = this.config.perToolMaxPerMinute?.[toolName] ?? this.config.globalMaxPerMinute;
    let toolEntry = this.perTool.get(toolName);
    if (!toolEntry) {
      toolEntry = { count: 0, windowStart: now };
      this.perTool.set(toolName, toolEntry);
    }
    this.gcEntry(toolEntry, now, windowMs);
    if (toolEntry.count >= toolLimit) {
      const retryAfterMs = windowMs - (now - toolEntry.windowStart);
      const error = new RateLimitError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded for tool '${toolName}': ${toolLimit} calls per minute`,
        {
          limit: toolLimit,
          windowMs,
          retryAfterMs: Math.max(0, retryAfterMs),
          toolName,
          currentUsed: toolEntry.count,
        }
      );
      this.writeRateLimitAuditEvent(toolName, error);
      return error;
    }

    return null;
  }

  /**
   * Record a call to `toolName`. Must be called after a successful check.
   */
  record(toolName: string): void {
    const now = Date.now();
    const windowMs = this.config.windowMs!;

    this.gcEntry(this.global, now, windowMs);
    this.global.count++;

    let toolEntry = this.perTool.get(toolName);
    if (!toolEntry) {
      toolEntry = { count: 0, windowStart: now };
      this.perTool.set(toolName, toolEntry);
    }
    this.gcEntry(toolEntry, now, windowMs);
    toolEntry.count++;
  }

  /**
   * Get current utilization snapshot (for status commands).
   */
  status(): { globalUsed: number; globalLimit: number; toolUsed: Map<string, number>; toolLimits: Map<string, number> } {
    const now = Date.now();
    const windowMs = this.config.windowMs!;
    this.gcEntry(this.global, now, windowMs);
    const toolUsed = new Map<string, number>();
    const toolLimits = new Map<string, number>();
    for (const [name, entry] of this.perTool) {
      this.gcEntry(entry, now, windowMs);
      toolUsed.set(name, entry.count);
      toolLimits.set(name, this.config.perToolMaxPerMinute?.[name] ?? this.config.globalMaxPerMinute);
    }
    return {
      globalUsed: this.global.count,
      globalLimit: this.config.globalMaxPerMinute,
      toolUsed,
      toolLimits,
    };
  }

  /**
   * Write a rate limit event to the audit log.
   */
  private writeRateLimitAuditEvent(toolName: string, error: RateLimitError): void {
    try {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        toolName,
        event: 'rate_limit_exceeded',
        status: 'rejected',
        errorCode: error.code,
        errorMessage: redactSecrets(error.message),
        limit: error.limit,
        windowMs: error.windowMs,
        retryAfterMs: error.retryAfterMs,
        currentUsed: error.currentUsed ?? 'unknown',
      };
      appendFileSync(GLOBAL_AUDIT_PATH, JSON.stringify(auditEntry) + '\n', 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  /**
   * Update the rate limit config dynamically.
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  private gcEntry(entry: SlidingWindowEntry, now: number, windowMs: number): void {
    if (now - entry.windowStart >= windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }
  }
}

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly limit: number;
  readonly windowMs: number;
  readonly retryAfterMs: number;
  readonly toolName?: string;
  readonly currentUsed?: number;

  constructor(
    code: string,
    message: string,
    details: {
      limit: number;
      windowMs: number;
      retryAfterMs: number;
      toolName?: string;
      currentUsed?: number;
    }
  ) {
    super(message);
    this.name = 'RateLimitError';
    this.limit = details.limit;
    this.windowMs = details.windowMs;
    this.retryAfterMs = details.retryAfterMs;
    this.toolName = details.toolName;
    this.currentUsed = details.currentUsed;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryAfterMs: this.retryAfterMs,
        limit: this.limit,
        windowMs: this.windowMs,
        toolName: this.toolName,
        currentUsed: this.currentUsed,
      },
    };
  }
}

/** Default rate limit config used when no flags are passed. */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  globalMaxPerMinute: 60,
  perToolMaxPerMinute: {
    'turpan.review_project': 20,
    'turpan.review_diff': 20,
    'turpan.live_ui_test': 10,
    'turpan.agent_output_audit': 10,
    'turpan.fix_findings': 20,
    'turpan.get_report': 60,
    'turpan.get_findings': 60,
  },
};
