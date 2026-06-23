/**
 * Turpan MCP Server — Main server implementation.
 *
 * Implements the Model Context Protocol (MCP) server using @modelcontextprotocol/sdk.
 * Exposes Turpan's review, test, and fix capabilities to AI agents.
 *
 * Security model:
 * - Read-only by default (fixMode defaults to patch-only)
 * - Applying patches requires explicit fixMode: 'apply'
 * - Workspace allowlist restricts which project paths can be accessed
 * - Path traversal is blocked
 * - Secrets are redacted from all outputs
 * - No arbitrary shell commands — only Turpan workflows
 * - Audit logging for every tool call
 * - Per-tool rate limiting
 * - Per-tool timeouts
 * - Concurrency guard (one active review per workspace)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
  LoggingMessageNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

import {
  reviewProject,
  reviewDiff,
  liveUiTest,
  agentOutputAudit,
  fixFindings,
  getReport,
  getFindings,
} from './tools/review.js';
import { listTurpanResources, readTurpanResource, TURPAN_PROTOCOL } from './resources/handler.js';
import { validateProjectPath, setWorkspaceAllowlist, formatSafeError } from './security/workspace.js';
import { redactError, formatSafeError as formatSafeErrorRedact } from './security/redact.js';
import {
  reviewProjectInputSchema,
  reviewDiffInputSchema,
  liveUiTestInputSchema,
  agentOutputAuditInputSchema,
  fixFindingsInputSchema,
  getReportInputSchema,
  getFindingsInputSchema,
} from './schemas/tools.js';
import {
  AuditContext,
  generateRunId,
  setGlobalAuditPath,
  RateLimiter,
  RateLimitError,
  DEFAULT_RATE_LIMIT,
  ConcurrencyGuard,
  withTimeout,
  getTimeoutForTool,
  DEFAULT_TIMEOUTS,
  ToolTimeoutError,
  TimeoutConfig,
  RateLimitConfig,
  AuditLogConfig,
  setAuditLogConfig,
} from './index.js';
import type { ConcurrencyGuardConfig } from './security/concurrency-guard.js';

export interface TurpanMcpServerConfig {
  /** Workspace roots to allow — if set, only these directories can be reviewed */
  workspaceRoots?: string[];
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Server name override */
  serverName?: string;
  /** Version override */
  version?: string;
  /** Rate limit configuration */
  rateLimit?: RateLimitConfig;
  /** Timeout configuration */
  timeouts?: TimeoutConfig;
  /** Session ID for this MCP connection */
  sessionId?: string;
  /** Concurrency guard configuration (stale lock settings) */
  concurrencyGuardConfig?: ConcurrencyGuardConfig;
  /** Audit log configuration (rotation settings) */
  auditLogConfig?: AuditLogConfig;
}

const DEFAULT_SERVER_NAME = 'turpan';
const DEFAULT_VERSION = '0.1.0';

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'turpan.review_project',
    description: 'Run a Turpan code review on a project. Returns findings, score, and verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute or relative path to the project to review' },
        mode: { type: 'string', enum: ['quick', 'deep'], description: 'quick=fast analysis, deep=comprehensive', default: 'quick' },
        includeUi: { type: 'boolean', description: 'Include live UI testing', default: false },
        includeRuntime: { type: 'boolean', description: 'Include runtime analysis', default: false },
        includeSecurity: { type: 'boolean', description: 'Include security checks', default: true },
        includeAgentAudit: { type: 'boolean', description: 'Run agent output audit if taskFile provided', default: false },
        taskFile: { type: 'string', description: 'Path to task/prompt file for agent audit' },
        fixMode: { type: 'string', enum: ['patch-only', 'apply'], description: 'patch-only=generate diff only, apply=apply fixes', default: 'patch-only' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'turpan.review_diff',
    description: 'Review the diff between two git refs (branches, commits, tags).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the project' },
        baseRef: { type: 'string', description: 'Base git ref (e.g. main, v1.0.0)' },
        targetRef: { type: 'string', description: 'Target git ref to compare against baseRef' },
        includeUi: { type: 'boolean', description: 'Include UI checks in diff review', default: false },
        taskFile: { type: 'string', description: 'Optional task file for context' },
      },
      required: ['projectPath', 'baseRef', 'targetRef'],
    },
  },
  {
    name: 'turpan.live_ui_test',
    description: 'Run live UI tests using Playwright — start dev server, open browser, test routes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the project' },
        url: { type: 'string', description: 'Skip server start, use existing URL (e.g. http://localhost:3000)' },
        headed: { type: 'boolean', description: 'Run with visible browser', default: false },
        mobile: { type: 'boolean', description: 'Only test mobile viewport (390×844)', default: false },
        trace: { type: 'boolean', description: 'Capture Playwright traces', default: false },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'turpan.agent_output_audit',
    description: 'Audit agent implementation against the original task — detect missing/shallow/fake implementations.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the project' },
        taskFile: { type: 'string', description: 'Path to the task/prompt file given to the agent' },
        agentName: { type: 'string', description: 'Agent type (claude-code, opencode, cursor, etc.)' },
      },
      required: ['projectPath', 'taskFile'],
    },
  },
  {
    name: 'turpan.fix_findings',
    description: 'Generate or apply fixes for Turpan findings. Default is patch-only — requires explicit fixMode: apply.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the project' },
        runId: { type: 'string', description: 'Run ID to fix findings from (default: latest run)' },
        findingIds: { type: 'array', items: { type: 'string' }, description: 'Specific finding IDs to fix (default: all)' },
        fixMode: { type: 'string', enum: ['patch-only', 'apply'], description: 'patch-only=generate diff, apply=apply to working tree', default: 'patch-only' },
      },
      required: ['projectPath', 'fixMode'],
    },
  },
  {
    name: 'turpan.get_report',
    description: 'Retrieve the Turpan analysis report in the specified format.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the project' },
        runId: { type: 'string', description: 'Run ID (default: latest)' },
        format: { type: 'string', enum: ['markdown', 'html', 'json'], description: 'Report format', default: 'markdown' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'turpan.get_findings',
    description: 'Retrieve findings from a Turpan run, optionally filtered by severity or category.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to the project' },
        runId: { type: 'string', description: 'Run ID (default: latest)' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'], description: 'Filter by severity' },
        category: { type: 'string', description: 'Filter by category' },
      },
      required: ['projectPath'],
    },
  },
] as const;

// ─── Server Class ────────────────────────────────────────────────────────────

export class TurpanMcpServer {
  private server: Server;
  private config: Required<TurpanMcpServerConfig>;
  private projectPath: string = process.cwd();
  private rateLimiter: RateLimiter;
  private concurrencyGuard: ConcurrencyGuard;
  private sessionId: string;
  private currentRunId: string | null = null;

  constructor(config: TurpanMcpServerConfig = {}) {
    this.sessionId = config.sessionId ?? randomUUID();

    this.config = {
      workspaceRoots: config.workspaceRoots ?? [],
      logLevel: config.logLevel ?? 'info',
      serverName: config.serverName ?? DEFAULT_SERVER_NAME,
      version: config.version ?? DEFAULT_VERSION,
      rateLimit: config.rateLimit ?? DEFAULT_RATE_LIMIT,
      timeouts: config.timeouts ?? DEFAULT_TIMEOUTS,
      sessionId: this.sessionId,
    };

    // Set workspace allowlist
    if (this.config.workspaceRoots.length > 0) {
      setWorkspaceAllowlist(this.config.workspaceRoots);
      // Set audit log path to first workspace root
      setGlobalAuditPath(this.config.workspaceRoots[0], this.config.auditLogConfig);
    } else {
      // Default to cwd for audit logging
      setGlobalAuditPath(process.cwd(), this.config.auditLogConfig);
    }

    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.concurrencyGuard = new ConcurrencyGuard(this.config.concurrencyGuardConfig);

    this.server = new Server(
      {
        name: this.config.serverName,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    const { server } = this;

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      const args = (rawArgs ?? {}) as Record<string, unknown>;

      const emitLog = (msg: string) => {
        server.sendNotification(LoggingMessageNotificationSchema, {
          level: this.config.logLevel,
          data: msg,
        });
      };

      // ── Security Gates ────────────────────────────────────────────────

      // 1. Rate limit check
      const rateLimitError = this.rateLimiter.check(name);
      if (rateLimitError) {
        emitLog(`[RATE LIMIT] ${rateLimitError.message}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(rateLimitError.toJSON(), null, 2) }],
          isError: true,
        };
      }

      // 2. Concurrency guard — only for review-writing tools
      const writeTools = ['turpan.review_project', 'turpan.review_diff', 'turpan.live_ui_test', 'turpan.agent_output_audit'];
      let auditContext: AuditContext | null = null;
      if (writeTools.includes(name)) {
        const projectPath = (args['projectPath'] as string) ?? this.projectPath;
        const workspaceKey = this.config.workspaceRoots.length > 0
          ? this.config.workspaceRoots.find(w => projectPath.startsWith(w)) ?? projectPath
          : projectPath;
        const runId = generateRunId();
        this.currentRunId = runId;

        const busy = this.concurrencyGuard.tryClaim(workspaceKey, runId, name);
        if (busy) {
          emitLog(`[BUSY] Workspace already has an active review run: ${busy.runId}`);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 'WORKSPACE_BUSY',
                  message: `Workspace is busy with an active review run (${busy.runId})`,
                  activeRunId: busy.runId,
                  activeSince: busy.startedAt,
                  activeTool: busy.toolName,
                  retryAfterMs: 30_000,
                },
              }, null, 2),
            }],
            isError: true,
          };
        }

        // Create audit context for write tools
        auditContext = new AuditContext({
          toolName: name,
          projectPath,
          workspace: workspaceKey,
          sessionId: this.sessionId,
          runId,
          input: args,
        });

        // Set a timer to auto-release concurrency on timeout
        const timeoutMs = getTimeoutForTool(name, this.config.timeouts);
        setTimeout(() => {
          const released = this.concurrencyGuard.releaseByRunIdWithReason(
            runId,
            `auto-release after ${timeoutMs}ms timeout`
          );
          if (released) {
            emitLog(`[STALE CLEANUP] Run ${runId} auto-released after timeout (was active since ${released.startedAt})`);
          }
          this.currentRunId = null;
        }, timeoutMs + 1000).unref();
      }

      // 3. Timeout wrapper
      const timeoutMs = getTimeoutForTool(name, this.config.timeouts);

      try {
        // Record the call in rate limiter
        this.rateLimiter.record(name);

        let result: unknown;
        if (auditContext) {
          // Wrap with audit + concurrency
          result = await withTimeout(name, timeoutMs, async () => {
            return await this.handleToolCall(name, args, emitLog, auditContext!);
          });
          auditContext.succeed(JSON.stringify(result).slice(0, 500));
        } else {
          result = await withTimeout(name, timeoutMs, () =>
            this.handleToolCall(name, args, emitLog, null)
          );
        }

        // Release concurrency slot on success for write tools
        if (writeTools.includes(name)) {
          const projectPath = (args['projectPath'] as string) ?? this.projectPath;
          const workspaceKey = this.config.workspaceRoots.length > 0
            ? this.config.workspaceRoots.find(w => projectPath.startsWith(w)) ?? projectPath
            : projectPath;
          this.concurrencyGuard.release(workspaceKey);
          this.currentRunId = null;
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      } catch (err) {
        // Release concurrency slot on error
        if (writeTools.includes(name)) {
          const projectPath = (args['projectPath'] as string) ?? this.projectPath;
          const workspaceKey = this.config.workspaceRoots.length > 0
            ? this.config.workspaceRoots.find(w => projectPath.startsWith(w)) ?? projectPath
            : projectPath;
          this.concurrencyGuard.release(workspaceKey);
          this.currentRunId = null;
        }

        if (err instanceof ToolTimeoutError) {
          if (auditContext) auditContext.timeout(timeoutMs);
          emitLog(`[TIMEOUT] ${err.message}`);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 'TOOL_TIMEOUT',
                  message: err.message,
                  toolName: err.toolName,
                  maxMs: err.maxMs,
                },
              }, null, 2),
            }],
            isError: true,
          };
        }

        if (err instanceof RateLimitError) {
          // Already handled above, but belt-and-suspenders
          return {
            content: [{ type: 'text', text: JSON.stringify(err.toJSON(), null, 2) }],
            isError: true,
          };
        }

        if (auditContext) auditContext.fail(redactError(err));
        const safe = formatSafeErrorRedact(err);
        emitLog(`[ERROR] ${safe.message}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: safe.message, code: safe.code }, null, 2) }],
          isError: true,
        };
      }
    });

    // List resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = listTurpanResources(this.projectPath);
      return { resources };
    });

    // Read resource — with URI validation
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      // Validate URI before passing to handler
      const parsed = this.parseAndValidateResourceUri(uri);
      if (!parsed.valid) {
        return {
          contents: [{ type: 'text', text: `Invalid resource URI: ${parsed.error}` }],
          isError: true,
        };
      }

      const result = readTurpanResource(this.projectPath, uri);
      if (!result) {
        return {
          contents: [{ type: 'text', text: `Resource not found: ${uri}` }],
          isError: true,
        };
      }
      return {
        contents: [{
          uri,
          mimeType: result.mimeType,
          text: result.content,
        }],
      };
    });

    // Set log level
    server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      this.config.logLevel = request.params.level as 'debug' | 'info' | 'warn' | 'error';
    });
  }

  /**
   * Parse and validate a resource URI before processing.
   * Blocks path traversal and ensures only turpan:// URIs are allowed.
   */
  private parseAndValidateResourceUri(uri: string): { valid: boolean; error?: string } {
    // Only allow turpan:// protocol
    if (!uri.startsWith('turpan://')) {
      return { valid: false, error: `Unsupported protocol: ${uri.split('://')[0]}` };
    }

    // Block any path traversal attempts within the URI
    const pathPart = uri.slice('turpan://'.length);
    if (pathPart.includes('..') || pathPart.includes('\\')) {
      return { valid: false, error: 'Path traversal not allowed in resource URI' };
    }

    // URI must match expected pattern: turpan://runs/<runId>/<resourceName>
    if (!uri.match(/^turpan:\/\/runs\/[a-zA-Z0-9_:-]+\/[a-zA-Z0-9_.]+$/)) {
      return { valid: false, error: `Malformed turpan:// URI: ${uri}` };
    }

    return { valid: true };
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown>,
    emitLog: (msg: string) => void,
    auditContext: AuditContext | null
  ): Promise<unknown> {
    switch (name) {
      case 'turpan.review_project': {
        const input = reviewProjectInputSchema.parse(args);
        if (this.config.workspaceRoots.length > 0) {
          const validated = validateProjectPath(input.projectPath);
          this.projectPath = validated.resolved;
        }
        return await reviewProject(input, emitLog);
      }

      case 'turpan.review_diff': {
        const input = reviewDiffInputSchema.parse(args);
        return await reviewDiff(input, emitLog);
      }

      case 'turpan.live_ui_test': {
        const input = liveUiTestInputSchema.parse(args);
        return await liveUiTest(input, emitLog);
      }

      case 'turpan.agent_output_audit': {
        const input = agentOutputAuditInputSchema.parse(args);
        return await agentOutputAudit(input, emitLog);
      }

      case 'turpan.fix_findings': {
        const input = fixFindingsInputSchema.parse(args);
        if (input.fixMode !== 'patch-only' && input.fixMode !== 'apply') {
          throw new Error('fixMode must be "patch-only" or "apply"');
        }
        return await fixFindings(input, emitLog);
      }

      case 'turpan.get_report': {
        const input = getReportInputSchema.parse(args);
        return await getReport(input, emitLog);
      }

      case 'turpan.get_findings': {
        const input = getFindingsInputSchema.parse(args);
        return await getFindings(input, emitLog);
      }

      default:
        return { error: `Unknown tool: ${name}`, code: 'TOOL_NOT_FOUND' };
    }
  }

  /**
   * Start the MCP server using stdio transport.
   * This is the main entry point for MCP integration.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Get the configured workspace project path.
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Set the active project path (for workspace-scoped mode).
   */
  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  /**
   * Get the session ID for this MCP connection.
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

export { TurpanMcpServer as default };
