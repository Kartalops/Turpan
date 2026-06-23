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

export interface TimeoutConfig {
  timeouts: Record<string, number>;  // tool name → max duration in ms
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  timeouts: {
    'turpan.review_project': 300_000,     // 5 minutes
    'turpan.review_diff': 300_000,
    'turpan.live_ui_test': 300_000,
    'turpan.agent_output_audit': 300_000,
    'turpan.fix_findings': 300_000,
    'turpan.get_report': 120_000,          // 2 minutes
    'turpan.get_findings': 120_000,
  },
};

/**
 * TimeoutError thrown when a tool call exceeds its time limit.
 */
export class ToolTimeoutError extends Error {
  readonly code = 'TOOL_TIMEOUT';
  readonly toolName: string;
  readonly maxMs: number;

  constructor(toolName: string, maxMs: number) {
    super(`Tool '${toolName}' timed out after ${maxMs}ms`);
    this.name = 'ToolTimeoutError';
    this.toolName = toolName;
    this.maxMs = maxMs;
  }
}

/**
 * Wrap an async function with a timeout. Throws ToolTimeoutError on timeout.
 */
export async function withTimeout<T>(
  toolName: string,
  maxMs: number,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ToolTimeoutError(toolName, maxMs));
    }, maxMs);

    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

/**
 * Get the configured timeout for a tool, falling back to 5 minutes.
 */
export function getTimeoutForTool(toolName: string, config: TimeoutConfig): number {
  return config.timeouts[toolName] ?? 300_000;
}
