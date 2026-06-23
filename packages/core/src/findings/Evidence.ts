/**
 * Evidence — structured proof for a Finding
 * Every Finding must be backed by concrete evidence, never vague assertion
 */

export type EvidenceType =
  | 'command-log'  // stdout/stderr from a tool
  | 'code'         // Source code excerpt
  | 'screenshot'   // UI screenshot path/URL
  | 'trace'        // Stack trace or runtime trace
  | 'network'      // HTTP request/response
  | 'console'      // Browser/devtools console output
  | 'file'         // File content or metadata
  | 'diff'         // Git diff or patch
  | 'metric'
  | 'text';      // Numeric measurement

export interface Evidence {
  type: EvidenceType;
  /** Human-readable label for this evidence */
  label?: string;
  /** Absolute path to file (when type is 'file', 'code', 'diff', 'screenshot') */
  path?: string;
  /** Code/screenshot excerpt or console output */
  excerpt?: string;
  /** URL for screenshot, network trace, or external reference */
  url?: string;
  /** Unix timestamp when evidence was collected */
  timestamp?: string;
  /** Command that produced this evidence (for command-log type) */
  command?: string;
  /** Exit code of the command */
  exitCode?: number;
  /** Numeric metric value */
  value?: number;
  /** Unit of the metric */
  unit?: string;
  /** Additional metadata */
  metadata?: Record<string, string | number | boolean>;
}

export function createEvidence(type: EvidenceType, partial: Partial<Evidence> = {}): Evidence {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

export function createCommandEvidence(
  command: string,
  stdout: string,
  exitCode: number,
  partial: Partial<Evidence> = {}
): Evidence {
  return createEvidence('command-log', {
    command,
    excerpt: stdout.length > 2000 ? stdout.slice(0, 2000) + '\n…[truncated]' : stdout,
    exitCode,
    ...partial,
  });
}

export function createCodeEvidence(
  path: string,
  excerpt: string,
  partial: Partial<Evidence> = {}
): Evidence {
  return createEvidence('code', { path, excerpt, ...partial });
}

export function createMetricEvidence(
  value: number,
  unit: string,
  label?: string,
  partial: Partial<Evidence> = {}
): Evidence {
  return createEvidence('metric', { value, unit, label, ...partial });
}
