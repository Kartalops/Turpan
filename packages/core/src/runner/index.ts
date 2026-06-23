/**
 * Runner module — safe command execution for Turpan review stages.
 */

export { SafeCommandRunner, type SafeCommandRunnerConfig } from './SafeCommandRunner.js';
export type { CommandResult, CommandRunOptions, CommandSummary } from './CommandResult.js';
export { STAGE_SEVERITY } from './CommandResult.js';
export {
  type CommandPolicyConfig,
  type AllowlistModel,
  type ScriptValidation,
  DANGEROUS_PATTERNS,
  isModelAllowed,
  checkDangerousPatterns,
  detectPackageManager,
  validateScript,
} from './CommandPolicy.js';
export {
  LogRedactor,
  defaultRedactor,
  type RedactionConfig,
} from './LogRedactor.js';
export {
  runWithTimeout,
  waitForExit,
  ProcessTimeoutError,
  type TimeoutOptions,
} from './ProcessTimeout.js';
