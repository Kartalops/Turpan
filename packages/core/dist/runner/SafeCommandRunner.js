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
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { checkDangerousPatterns, validateScript, } from './CommandPolicy.js';
import { defaultRedactor } from './LogRedactor.js';
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
export class SafeCommandRunner {
    config;
    redactor;
    logDir;
    constructor(config) {
        this.redactor = config.redactor ?? defaultRedactor;
        this.config = {
            projectRoot: config.projectRoot,
            runId: config.runId,
            defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
            redactor: this.redactor,
            onBeforeCommand: config.onBeforeCommand ?? (() => { }),
            onAfterCommand: config.onAfterCommand ?? (() => { }),
            allowlist: config.allowlist,
            blockDangerousPatterns: config.blockDangerousPatterns ?? true,
            allowShellOperators: config.allowShellOperators ?? false,
            defaultAllowlist: config.defaultAllowlist,
        };
        // Set up log directory
        this.logDir = join(this.config.projectRoot, '.turpan', 'runs', 'latest', 'logs');
        this.ensureLogDir();
    }
    ensureLogDir() {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }
    }
    /**
     * Run a raw command string (e.g. "npm run build") after policy checks.
     */
    async run(command, options = {}) {
        const cwd = options.cwd ?? this.config.projectRoot;
        const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs;
        // Step 1: Policy check
        const policyResult = this.checkPolicy(command);
        if (policyResult.blocked) {
            return this.buildBlockedResult(command, cwd, policyResult);
        }
        // Step 2: Parse command into argv
        const argv = this.parseCommand(command);
        if (!argv) {
            return this.buildBlockedResult(command, cwd, {
                blocked: true,
                reason: 'Failed to parse command — possible shell injection attempt',
                severity: 'high',
            });
        }
        // Step 3: Execute
        this.config.onBeforeCommand(command);
        const result = await this.execute(argv[0], argv.slice(1), {
            cwd,
            env: options.env,
            timeoutMs: timeoutMs,
            signal: options.signal,
        });
        // Step 4: Save log
        if (options.saveLog !== false) {
            const logPath = this.saveLog(command, result, options.stageName);
            result.logPath = logPath;
        }
        this.config.onAfterCommand(result);
        return result;
    }
    /**
     * Run a package.json script by name (e.g. "build", "test").
     * Validates the script content before running.
     */
    async runScript(scriptName, packageScripts, options = {}) {
        const scriptContent = packageScripts[scriptName];
        if (!scriptContent) {
            return this.buildBlockedResult(`script:${scriptName}`, this.config.projectRoot, { blocked: true, reason: `Script '${scriptName}' not found in package.json`, severity: 'high' });
        }
        // Validate script content
        const validation = validateScript(scriptName, scriptContent, this.config);
        if (!validation.allowed) {
            return this.buildBlockedResult(`script:${scriptName}`, this.config.projectRoot, { blocked: true, reason: validation.reason, severity: validation.severity });
        }
        // Run the script command
        const command = `npm run ${scriptName}`;
        const result = await this.run(command, { ...options, stageName: options.stageName ?? scriptName });
        return result;
    }
    /**
     * Check if a raw command string passes policy.
     */
    checkPolicy(command) {
        if (this.config.blockDangerousPatterns !== false) {
            const dangerous = checkDangerousPatterns(command);
            if (dangerous.blocked)
                return dangerous;
        }
        return { blocked: false };
    }
    // ─── Private Helpers ───────────────────────────────────────────────────────
    parseCommand(command) {
        // Simple single-command parser — no shell evaluation
        // This prevents injection via ; | && || > etc.
        const parts = command.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0)
            return null;
        // Check for shell operators (basic check)
        if (!this.config.allowShellOperators) {
            const hasShellOp = /[;|<>&$`\\]/.test(command);
            if (hasShellOp)
                return null;
        }
        return parts;
    }
    async execute(cmd, args, options) {
        const start = Date.now();
        const { cwd, env, timeoutMs, signal } = options;
        return new Promise(resolve => {
            const proc = spawn(cmd, args, {
                cwd,
                env: { ...process.env, ...env },
                shell: false, // SECURITY: never shell out
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            proc.stdout?.on('data', data => { stdout += data.toString(); });
            proc.stderr?.on('data', data => { stderr += data.toString(); });
            // Wire abort signal
            const onAbort = () => {
                try {
                    process.kill(proc.pid, 'SIGKILL');
                }
                catch { /* ignore */ }
            };
            signal?.addEventListener('abort', onAbort);
            // Timeout
            const timer = setTimeout(() => {
                timedOut = true;
                try {
                    process.kill(proc.pid, 'SIGKILL');
                }
                catch { /* ignore */ }
            }, timeoutMs);
            proc.once('exit', (code, sig) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                resolve({
                    command: `${cmd} ${args.join(' ')}`,
                    cwd,
                    exitCode: code,
                    signal: sig,
                    stdout,
                    stderr,
                    durationMs: Date.now() - start,
                    blocked: false,
                    timedOut,
                });
            });
            proc.once('error', err => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                resolve({
                    command: `${cmd} ${args.join(' ')}`,
                    cwd,
                    exitCode: null,
                    signal: null,
                    stdout,
                    stderr,
                    durationMs: Date.now() - start,
                    blocked: false,
                    timedOut: false,
                    blockReason: `Process error: ${err.message}`,
                    blockSeverity: 'high',
                });
            });
        });
    }
    buildBlockedResult(command, cwd, policy) {
        return {
            command,
            cwd,
            exitCode: null,
            signal: null,
            stdout: '',
            stderr: '',
            durationMs: 0,
            blocked: true,
            blockReason: policy.reason,
            blockSeverity: policy.severity,
            timedOut: false,
        };
    }
    saveLog(command, result, stageName) {
        this.ensureLogDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeCmd = command.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const filename = stageName
            ? `${stageName}_${timestamp}.log`
            : `${safeCmd}_${timestamp}.log`;
        const logPath = join(this.logDir, filename);
        const header = [
            `# Turpan Command Log`,
            `# Timestamp: ${new Date().toISOString()}`,
            `# Command: ${command}`,
            `# Exit Code: ${result.exitCode ?? 'null'}`,
            `# Duration: ${result.durationMs}ms`,
            `# Timed Out: ${result.timedOut}`,
            `# Blocked: ${result.blocked}`,
            result.blockReason ? `# Block Reason: ${result.blockReason}` : '',
            `# Working Dir: ${result.cwd}`,
            '',
            '## STDOUT',
            '---',
            this.redactor.redact(result.stdout),
            '',
            '## STDERR',
            '---',
            this.redactor.redact(result.stderr),
        ].filter(Boolean).join('\n');
        writeFileSync(logPath, header, 'utf-8');
        return logPath;
    }
    /**
     * Build a summary of a command result for reporting.
     */
    summarize(result) {
        return {
            command: result.command,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            durationMs: result.durationMs,
            blocked: result.blocked,
        };
    }
    /** Get the log directory path */
    getLogDir() {
        return this.logDir;
    }
}
//# sourceMappingURL=SafeCommandRunner.js.map