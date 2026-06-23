/**
 * SafeCommandRunner — execute project commands safely, capture logs, detect failures.
 *
 * Design principles:
 * - Never shell out (no shell: true) — prevents injection
 * - Always check policy before executing
 * - Always redact secrets from logs
 * - Always save logs to .turpan/runs/latest/logs/
 * - Timeout enforcement
 * - Non-zero exit codes are always failures
 */
import { type CommandPolicyConfig } from './CommandPolicy.js';
import { LogRedactor } from './LogRedactor.js';
import type { CommandResult, CommandRunOptions, CommandSummary } from './CommandResult.js';
export interface SafeCommandRunnerConfig extends CommandPolicyConfig {
    /** Project root for all commands */
    projectRoot: string;
    /** Run ID for log directory structure */
    runId: string;
    /** Default timeout in ms (default: 120_000) */
    defaultTimeoutMs?: number;
    /** Custom redactor (default: global singleton) */
    redactor?: LogRedactor;
    /** Called before each command execution */
    onBeforeCommand?: (command: string) => void;
    /** Called after each command with the result */
    onAfterCommand?: (result: CommandResult) => void;
}
export declare class SafeCommandRunner {
    private config;
    private redactor;
    private logDir;
    constructor(config: SafeCommandRunnerConfig);
    private ensureLogDir;
    /**
     * Run a raw command string (e.g. "npm run build") after policy checks.
     */
    run(command: string, options?: CommandRunOptions): Promise<CommandResult>;
    /**
     * Run a package.json script by name (e.g. "build", "test").
     * Validates the script content before running.
     */
    runScript(scriptName: string, packageScripts: Record<string, string>, options?: CommandRunOptions): Promise<CommandResult>;
    /**
     * Check if a raw command string passes policy.
     */
    checkPolicy(command: string): {
        blocked: boolean;
        reason?: string;
        severity?: 'critical' | 'high';
    };
    private parseCommand;
    private execute;
    private buildBlockedResult;
    private saveLog;
    /**
     * Build a summary of a command result for reporting.
     */
    summarize(result: CommandResult): CommandSummary;
    /** Get the log directory path */
    getLogDir(): string;
}
//# sourceMappingURL=SafeCommandRunner.d.ts.map