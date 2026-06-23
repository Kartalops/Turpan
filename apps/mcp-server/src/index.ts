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

import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { TurpanMcpServer, type TurpanMcpServerConfig } from './server.js';
import {
  setWorkspaceAllowlist,
  getWorkspaceAllowlist,
  getWorkspaceAllowlist as getAllowlist,
} from './security/workspace.js';
import {
  DEFAULT_RATE_LIMIT,
  RateLimitConfig,
  RateLimiter,
  RateLimitError,
} from './security/rate-limiter.js';
import {
  DEFAULT_TIMEOUTS,
  TimeoutConfig,
  ToolTimeoutError,
  withTimeout,
  getTimeoutForTool,
} from './security/timeouts.js';
import {
  AuditContext,
  generateRunId,
  setGlobalAuditPath,
  setAuditLogConfig,
  getAuditLogConfig,
  getAuditLogPath,
  getRecentRuns,
  getLastError,
  getRecentRuns as fetchRecentRuns,
  logStaleRelease,
  type AuditLogConfig,
  type RunIndexEntry,
} from './security/audit-logger.js';
import {
  ConcurrencyGuard,
  type ConcurrencyGuardConfig,
  type ActiveRun,
} from './security/concurrency-guard.js';

// Re-export security primitives for server.ts
export {
  RateLimiter,
  RateLimitError,
  DEFAULT_RATE_LIMIT,
  type RateLimitConfig,
  ToolTimeoutError,
  withTimeout,
  getTimeoutForTool,
  DEFAULT_TIMEOUTS,
  type TimeoutConfig,
  AuditContext,
  generateRunId,
  setGlobalAuditPath,
  setAuditLogConfig,
  getAuditLogConfig,
  getAuditLogPath,
  getRecentRuns,
  getLastError,
  type AuditLogConfig,
  type RunIndexEntry,
  ConcurrencyGuard,
  type ConcurrencyGuardConfig,
  type ActiveRun,
};

// Global instances for status command
let globalRateLimiter: RateLimiter | null = null;
let globalConcurrencyGuard: ConcurrencyGuard | null = null;
let globalProjectPath: string = process.cwd();

function getStatusRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT);
  }
  return globalRateLimiter;
}

function getStatusConcurrencyGuard(): ConcurrencyGuard {
  if (!globalConcurrencyGuard) {
    globalConcurrencyGuard = new ConcurrencyGuard();
  }
  return globalConcurrencyGuard;
}

/**
 * Count ALL runs in the run index file (not just the most recent N).
 * Used for status reporting.
 */
function countAllRunsInIndex(projectPath: string): number {
  const indexPath = join(projectPath, '.turpan', 'mcp-runs.jsonl');
  if (!existsSync(indexPath)) return 0;
  try {
    const content = readFileSync(indexPath, 'utf-8');
    return content.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function startServer(config: TurpanMcpServerConfig): Promise<void> {
  const server = new TurpanMcpServer(config);
  globalProjectPath = config.workspaceRoots?.[0] ?? process.cwd();
  await server.start();
}

// ─── MCP Serve Command ────────────────────────────────────────────────────────

function createMcpServeCommand(): Command {
  const cmd = new Command('serve');
  cmd.description('Start the Turpan MCP server (stdio transport)');

  cmd
    .option('-w, --workspace <path>', 'Scope MCP access to a specific project directory')
    .option('--log-level <level>', 'Log level: debug | info | warn | error', 'info')
    .option('--max-calls-per-minute <n>', 'Global max MCP calls per minute per client', parseInt, DEFAULT_RATE_LIMIT.globalMaxPerMinute)
    .option('--max-tool-calls-per-minute <n>', 'Max calls per individual tool per minute (overridden by per-tool flags)', parseInt, 20)
    .option('--max-review-calls-per-minute <n>', 'Max review_project calls per minute', parseInt, DEFAULT_RATE_LIMIT.perToolMaxPerMinute?.['turpan.review_project'] ?? 20)
    .option('--max-ui-test-calls-per-minute <n>', 'Max live_ui_test calls per minute', parseInt, DEFAULT_RATE_LIMIT.perToolMaxPerMinute?.['turpan.live_ui_test'] ?? 10)
    .option('--audit-max-size-mb <n>', 'Max audit log size in MB before rotation (0=disabled)', parseInt, 10)
    .option('--audit-max-files <n>', 'Max number of rotated audit log files to keep', parseInt, 5)
    .option('--audit-daily-rotation', 'Enable daily audit log rotation')
    .option('--stale-lock-timeout-ms <n>', 'Timeout in ms before a lock is considered stale', parseInt, 300000)
    .option('--stale-lock-grace-ms <n>', 'Grace period in ms after stale detection before auto-release', parseInt, 30000)
    .action(async (options: {
      workspace?: string;
      logLevel?: string;
      maxCallsPerMinute?: number;
      maxToolCallsPerMinute?: number;
      maxReviewCallsPerMinute?: number;
      maxUiTestCallsPerMinute?: number;
      auditMaxSizeMb?: number;
      auditMaxFiles?: number;
      auditDailyRotation?: boolean;
      staleLockTimeoutMs?: number;
      staleLockGraceMs?: number;
    }) => {
      const config: TurpanMcpServerConfig = {
        logLevel: (options.logLevel as 'debug' | 'info' | 'warn' | 'error') ?? 'info',
      };

      if (options.workspace) {
        const workspacePath = resolve(process.cwd(), options.workspace);
        if (!existsSync(workspacePath)) {
          console.error(chalk.red(`\n❌ Workspace path does not exist: ${workspacePath}\n`));
          process.exit(1);
        }
        config.workspaceRoots = [workspacePath];
        config.workspaceRoots.forEach(root => setWorkspaceAllowlist([root]));
      }

      // Configure audit log rotation
      const auditConfig: AuditLogConfig = {};
      if (options.auditMaxSizeMb !== undefined) {
        auditConfig.maxSizeMb = options.auditMaxSizeMb;
      }
      if (options.auditMaxFiles !== undefined) {
        auditConfig.maxFiles = options.auditMaxFiles;
      }
      if (options.auditDailyRotation) {
        auditConfig.dailyRotation = true;
      }
      const projectPath = options.workspace ? resolve(process.cwd(), options.workspace) : process.cwd();
      setGlobalAuditPath(projectPath, auditConfig);

      // Configure concurrency guard with stale lock settings
      const concurrencyConfig: ConcurrencyGuardConfig = {};
      if (options.staleLockTimeoutMs !== undefined) {
        concurrencyConfig.staleTimeoutMs = options.staleLockTimeoutMs;
      }
      if (options.staleLockGraceMs !== undefined) {
        concurrencyConfig.gracePeriodMs = options.staleLockGraceMs;
      }
      config.concurrencyGuardConfig = concurrencyConfig;

      // Build rate limit config
      const rateLimitConfig: RateLimitConfig = {
        globalMaxPerMinute: options.maxCallsPerMinute ?? DEFAULT_RATE_LIMIT.globalMaxPerMinute,
        perToolMaxPerMinute: {
          ...DEFAULT_RATE_LIMIT.perToolMaxPerMinute,
          'turpan.review_project': options.maxReviewCallsPerMinute ?? 20,
          'turpan.review_diff': options.maxToolCallsPerMinute ?? 20,
          'turpan.live_ui_test': options.maxUiTestCallsPerMinute ?? 10,
          'turpan.agent_output_audit': options.maxToolCallsPerMinute ?? 10,
          'turpan.fix_findings': options.maxToolCallsPerMinute ?? 20,
          'turpan.get_report': options.maxCallsPerMinute ?? 60,
          'turpan.get_findings': options.maxCallsPerMinute ?? 60,
        },
      };
      config.rateLimit = rateLimitConfig;
      config.timeouts = DEFAULT_TIMEOUTS;

      // Initialize global status instances
      globalConcurrencyGuard = new ConcurrencyGuard({
        ...concurrencyConfig,
        onStaleRelease: (event) => {
          // Write stale release event to audit log (best-effort)
          try {
            logStaleRelease(event);
          } catch {
            // Non-fatal — stale release logging must not crash the server
          }
        },
        onManualRelease: (event) => {
          // Manual releases are also logged for full traceability
          try {
            logStaleRelease(event);
          } catch {
            // Non-fatal
          }
        },
      });
      globalRateLimiter = new RateLimiter(rateLimitConfig);
      globalProjectPath = projectPath;

      await startServer(config);
    });

  return cmd;
}

// ─── MCP Config Command ───────────────────────────────────────────────────────

function createMcpConfigCommand(): Command {
  const cmd = new Command('config');
  cmd.description('Show Turpan MCP server configuration for AI agent clients');

  cmd.option('--workspace <path>', 'Show config scoped to a specific workspace').action(async (options: { workspace?: string }) => {
    const workspacePath = options.workspace ? resolve(process.cwd(), options.workspace) : null;

    const configJson = {
      mcpServers: {
        turpan: {
          command: 'node',
          args: ['<path-to-turpan-mcp-dist>', 'mcp', 'serve', ...(workspacePath ? ['--workspace', workspacePath] : [])],
          env: {},
        },
      },
    };

    console.log(chalk.bold('\n🔌 Turpan MCP Server Configuration\n'));
    console.log(chalk.dim('Add this to your Claude Code MCP settings (~/.claude/settings.json):\n'));
    console.log(JSON.stringify(configJson, null, 2));
    console.log(chalk.dim('\nOr use the JSON config file at examples/mcp/turpan-mcp.json\n'));
    console.log(chalk.bold('Next steps:'));
    console.log(`  ${chalk.cyan('1. Copy the config above into your MCP settings')}`);
    console.log(`  ${chalk.cyan('2. Restart Claude Code or reload MCP servers')}`);
    console.log(`  ${chalk.cyan('3. Ask Turpan to review your project: "review the code in ./my-project"')}\n`);
  });

  return cmd;
}

// ─── MCP Status Command ───────────────────────────────────────────────────────

function createMcpStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Check MCP server status and configuration');

  cmd.option('--project <path>', 'Path to the project (default: cwd)').action(async (options: { project?: string }) => {
    const projectPath = options.project ? resolve(process.cwd(), options.project) : globalProjectPath;
    const roots = getWorkspaceAllowlist();
    const auditPath = getAuditLogPath();
    const auditCfg = getAuditLogConfig();
    const concurrencyCfg = getStatusConcurrencyGuard().getConfig();
    const recentRuns = getRecentRuns(projectPath, 10);
    const lastErr = getLastError(projectPath);
    const rateLimitStatus = getStatusRateLimiter().status();

    console.log(chalk.bold('\n🔍 Turpan MCP Status\n'));

    // Workspace allowlist
    console.log(chalk.bold('Workspace:'));
    console.log(`  Allowlist roots: ${roots.length > 0 ? roots.map(r => chalk.cyan(r)).join(', ') : chalk.dim('(none — all paths allowed)')}`);
    console.log(`  Project path:    ${chalk.cyan(projectPath)}`);
    console.log();

    // Active review lock
    console.log(chalk.bold('Concurrency Guard:'));
    const activeRuns = getStatusConcurrencyGuard().getAllActiveRuns();
    if (activeRuns.size > 0) {
      for (const [workspace, run] of activeRuns) {
        const timeLeft = getStatusConcurrencyGuard().getTimeUntilExpiry(workspace);
        console.log(`  Active run:      ${chalk.yellow(run.runId)}`);
        console.log(`    Tool:          ${run.toolName}`);
        console.log(`    Started:       ${run.startedAt}`);
        console.log(`    Expires in:    ${timeLeft !== null ? chalk.cyan(`${Math.round(timeLeft / 1000)}s`) : chalk.dim('(no expiry)')}`);
        console.log(`    Workspace:     ${workspace}`);
      }
    } else {
      console.log(`  Active run:      ${chalk.dim('(none)')}`);
    }
    console.log(`  Stale timeout:  ${chalk.cyan(`${(concurrencyCfg.staleTimeoutMs ?? 300000) / 1000}s`)}`);
    console.log(`  Grace period:   ${chalk.cyan(`${(concurrencyCfg.gracePeriodMs ?? 30000) / 1000}s`)}`);
    console.log();

    // Rate limit config
    console.log(chalk.bold('Rate Limits:'));
    console.log(`  Global:        ${chalk.cyan(`${rateLimitStatus.globalUsed}/${rateLimitStatus.globalLimit}`)} calls/min`);
    for (const [tool, used] of rateLimitStatus.toolUsed) {
      const limit = rateLimitStatus.toolLimits.get(tool) ?? rateLimitStatus.globalLimit;
      console.log(`  ${tool}: ${chalk.cyan(`${used}/${limit}`)} calls/min`);
    }
    console.log();

    // Audit log
    console.log(chalk.bold('Audit Log:'));
    console.log(`  Path:          ${auditPath ? chalk.cyan(auditPath) : chalk.dim('(not set)')}`);
    console.log(`  Max size:      ${auditCfg.maxSizeMb ? chalk.cyan(`${auditCfg.maxSizeMb}MB`) : chalk.dim('(disabled)')}`);
    console.log(`  Max files:     ${auditCfg.maxFiles ? chalk.cyan(`${auditCfg.maxFiles}`) : chalk.dim('(disabled)')}`);
    console.log(`  Daily rotate:  ${auditCfg.dailyRotation ? chalk.cyan('enabled') : chalk.dim('disabled')}`);
    console.log();

    // Recent runs
    console.log(chalk.bold('Recent Runs:'));
    const totalRunsCount = countAllRunsInIndex(projectPath);
    console.log(`  Total recorded runs: ${chalk.cyan(totalRunsCount)} (showing last ${Math.min(5, recentRuns.length)})`);
    if (recentRuns.length > 0) {
      for (const run of recentRuns.slice(-5)) {
        const duration = run.durationMs !== undefined ? `${Math.round(run.durationMs / 1000)}s` : '-';
        const statusColor = run.status === 'success' ? chalk.green :
                           run.status === 'failure' ? chalk.red :
                           run.status === 'timeout' ? chalk.yellow : chalk.dim;
        console.log(`  ${statusColor(run.status.padEnd(8))} ${chalk.cyan(run.runId)} ${run.tool} ${chalk.dim(`${duration} · ${run.startedAt}`)}`);
      }
    } else {
      console.log(`  ${chalk.dim('(no runs recorded)')}`);
    }
    console.log();

    // Last error
    if (lastErr) {
      console.log(chalk.bold('Last Error:'));
      console.log(`  ${chalk.red(lastErr)}`);
      console.log();
    }

    console.log(chalk.bold('Protocol:        ') + `${chalk.cyan('stdio (MCP over stdin/stdout)')}`);
    console.log(chalk.bold('Transport:       ') + `${chalk.cyan('@modelcontextprotocol/sdk v1.29+')}`);
    console.log(chalk.bold('Security:        ') + `${chalk.green('read-only default, patch-only fixes')}`);
    console.log();
  });

  return cmd;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function runMcpCommand(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('turpan mcp')
    .description('🐪 Turpan MCP Server — AI agent interface for code review, testing, and fixing');

  program.addCommand(createMcpServeCommand());
  program.addCommand(createMcpConfigCommand());
  program.addCommand(createMcpStatusCommand());

  // Commander expects argv in the form [node, script, ...args].
  // When invoked as a library function, callers may pass just [...args].
  // Prepend synthetic node + script to satisfy Commander's expectations.
  const fullArgv = argv[0] === 'node' || argv[0]?.endsWith?.('node')
    ? argv
    : ['node', 'turpan-mcp', ...argv];
  await program.parseAsync(fullArgv);
}

// Allow direct execution — only when this file is invoked directly,
// not when imported as a module. We detect this by comparing the entry
// script path against this module's URL.
const isDirectExecution = (() => {
  if (!process.argv[1]) return false;
  const entryPath = process.argv[1].replace(/\\/g, '/');
  return (
    import.meta.url === `file://${entryPath}` ||
    entryPath.endsWith('/mcp-server/dist/index.js') ||
    entryPath.endsWith('/turpan-mcp') ||
    entryPath.endsWith('/turpan-mcp.js')
  );
})();

if (isDirectExecution) {
  runMcpCommand(process.argv.slice(2)).catch((err) => {
    console.error(chalk.red(`\n❌ MCP error: ${err.message}\n`));
    process.exit(1);
  });
}
