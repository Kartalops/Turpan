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

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import { redactObject } from './redact.js';

export type AuditStatus = 'success' | 'failure' | 'rejected' | 'timeout';

export interface AuditEntry {
  timestamp: string;       // ISO 8601
  toolName: string;
  projectPath: string;
  workspace: string;
  sessionId?: string;
  callerId?: string;
  runId?: string;
  inputSummary: Record<string, unknown>;  // secrets redacted
  outputSummary: string;
  status: AuditStatus;
  durationMs: number;
  errorCode?: string;
}

export interface AuditLogConfig {
  /** Max size in MB before rotation (default: 10) */
  maxSizeMb?: number;
  /** Max number of rotated files to keep (default: 5) */
  maxFiles?: number;
  /** Enable daily rotation (default: false) */
  dailyRotation?: boolean;
}

export interface RunIndexEntry {
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

const GLOBAL_AUDIT_LOG = '.turpan/mcp-audit.log';
const RUN_INDEX_PATH = '.turpan/mcp-runs.jsonl';

let globalAuditPath: string | null = null;
let globalAuditConfig: AuditLogConfig = {
  maxSizeMb: 10,
  maxFiles: 5,
  dailyRotation: false,
};
let lastRotationDate: string | null = null;

/**
 * Configure the global audit log path and rotation settings.
 * Call once at server startup.
 */
export function setGlobalAuditPath(projectPath: string, config: AuditLogConfig = {}): void {
  const dir = join(projectPath, '.turpan');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  globalAuditPath = join(dir, 'mcp-audit.log');
  globalAuditConfig = { ...globalAuditConfig, ...config };
  lastRotationDate = new Date().toISOString().split('T')[0];
}

/**
 * Configure audit log rotation parameters.
 */
export function setAuditLogConfig(config: AuditLogConfig): void {
  globalAuditConfig = { ...globalAuditConfig, ...config };
}

/**
 * Get current audit log configuration.
 */
export function getAuditLogConfig(): AuditLogConfig {
  return { ...globalAuditConfig };
}

/**
 * Get the audit log path.
 */
export function getAuditLogPath(): string | null {
  return globalAuditPath;
}

/**
 * Generate a new runId for this session.
 */
export function generateRunId(): string {
  return `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/**
 * Check if log rotation is needed and perform it if necessary.
 * Rotation triggers when: max size exceeded, daily rotation date changed.
 * Redaction is preserved — rotated logs are gzip-compressed copies.
 */
function checkAndRotate(): void {
  if (!globalAuditPath) return;
  const config = globalAuditConfig;
  const logFile = globalAuditPath;

  // Check daily rotation
  if (config.dailyRotation) {
    const today = new Date().toISOString().split('T')[0];
    if (lastRotationDate && today > lastRotationDate!) {
      rotateLog(logFile, `daily-${lastRotationDate}`);
      lastRotationDate = today;
      return;
    }
    lastRotationDate = today;
  }

  // Check size rotation
  if (config.maxSizeMb && config.maxSizeMb > 0) {
    try {
      if (existsSync(logFile)) {
        const stats = statSync(logFile);
        const sizeMb = stats.size / (1024 * 1024);
        if (sizeMb >= config.maxSizeMb) {
          rotateLog(logFile);
        }
      }
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Rotate the current log file and enforce max rotated files limit.
 */
function rotateLog(logFile: string, suffix = ''): void {
  if (!existsSync(logFile)) return;

  const timestamp = suffix || new Date().toISOString().replace(/[:.]/g, '-');
  const rotatedName = `${logFile}.${timestamp}.gz`;
  const rotatedPath = rotateFileWithGzip(logFile, rotatedName);
  if (!rotatedPath) return;

  // Enforce max files
  if (globalAuditConfig.maxFiles && globalAuditConfig.maxFiles > 0) {
    cleanupOldRotations(logFile, globalAuditConfig.maxFiles);
  }
}

/**
 * Copy a file with gzip compression to preserve redaction in rotated logs.
 */
function rotateFileWithGzip(sourcePath: string, destPath: string): string | null {
  try {
    // We use a simple approach: read, compress, write
    // For gzip we need zlib - but we avoid adding a dependency.
    // Instead we just copy the file as-is to preserve content + append .gz marker
    // The .gz extension is informational — we don't actually compress to keep deps minimal.
    // Alternative: use the built-in zlib if available.
    const content = readFileSync(sourcePath, 'utf-8');
    const gzipped = gzipSync(Buffer.from(content, 'utf-8'));
    writeFileSync(destPath, gzipped);
    // Truncate original
    writeFileSync(sourcePath, '', 'utf-8');
    return destPath;
  } catch {
    // If compression fails, try simple copy
    try {
      const content = readFileSync(sourcePath, 'utf-8');
      writeFileSync(destPath, content, 'utf-8');
      writeFileSync(sourcePath, '', 'utf-8');
      return destPath;
    } catch {
      return null;
    }
  }
}

/**
 * Simple gzip compression using Node's built-in zlib.
 */
function gzipSync(buf: Buffer): Buffer {
  // Use dynamic import to avoid top-level await issues
  const { createGzip } = require('zlib');
  const zlib = require('zlib');
  return zlib.gzipSync(buf);
}

/**
 * Remove old rotated log files beyond maxFiles limit.
 */
function cleanupOldRotations(basePath: string, maxFiles: number): void {
  try {
    const dir = join(basePath, '..');
    const baseName = basename(basePath);
    const rotated = readdirSync(dir)
      .filter(f => f.startsWith(baseName + '.') && f !== baseName)
      .map(f => ({
        name: f,
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    for (let i = maxFiles; i < rotated.length; i++) {
      try {
        unlinkSync(rotated[i].path);
      } catch {
        // Non-fatal
      }
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Create an audit context — tracks start time and produces final entry.
 */
export class AuditContext {
  private readonly startTime: number;
  private readonly entry: Partial<AuditEntry>;

  constructor(params: {
    toolName: string;
    projectPath: string;
    workspace: string;
    sessionId?: string;
    callerId?: string;
    runId?: string;
    input: Record<string, unknown>;
  }) {
    this.startTime = Date.now();
    this.entry = {
      timestamp: new Date().toISOString(),
      toolName: params.toolName,
      projectPath: params.projectPath,
      workspace: params.workspace,
      sessionId: params.sessionId,
      callerId: params.callerId,
      runId: params.runId,
      inputSummary: redactObject(params.input) as Record<string, unknown>,
      outputSummary: '',
      status: 'success',
      durationMs: 0,
    };
  }

  /**
   * Record a rejected call (rate limit, validation failure, etc.)
   */
  reject(reason: string, errorCode?: string): void {
    this.entry.status = 'rejected';
    this.entry.outputSummary = reason;
    this.entry.errorCode = errorCode;
    this.finalize();
  }

  /**
   * Record a timeout.
   */
  timeout(maxMs: number): void {
    this.entry.status = 'timeout';
    this.entry.outputSummary = `Tool call timed out after ${maxMs}ms`;
    this.entry.errorCode = 'TIMEOUT';
    this.finalize();
  }

  /**
   * Record a failure (thrown error).
   */
  fail(errorMessage: string, errorCode?: string): void {
    this.entry.status = 'failure';
    this.entry.outputSummary = errorMessage;
    this.entry.errorCode = errorCode;
    this.finalize();
  }

  /**
   * Record success with output summary.
   */
  succeed(outputSummary: string): void {
    this.entry.status = 'success';
    this.entry.outputSummary = truncate(outputSummary, 500);
    this.finalize();
  }

  private finalize(): void {
    this.entry.durationMs = Date.now() - this.startTime;
    const line = JSON.stringify(this.entry) + '\n';

    // Write to global log with rotation check
    if (globalAuditPath) {
      try {
        checkAndRotate(); // Check before appending
        appendFileSync(globalAuditPath, line, 'utf-8');
      } catch {
        // Non-fatal — don't crash the tool call
      }
    }

    // Write to workspace-scoped log
    if (this.entry.runId && this.entry.projectPath) {
      const runDir = join(this.entry.projectPath, '.turpan', 'runs', this.entry.runId);
      const scopedLog = join(runDir, 'mcp-audit.jsonl');
      try {
        if (!existsSync(runDir)) {
          mkdirSync(runDir, { recursive: true });
        }
        appendFileSync(scopedLog, line, 'utf-8');
      } catch {
        // Non-fatal
      }
    }

    // Update run index
    if (this.entry.runId) {
      this.updateRunIndex();
    }
  }

  private updateRunIndex(): void {
    if (!this.entry.runId || !this.entry.projectPath) return;
    const indexPath = join(this.entry.projectPath, '.turpan', 'mcp-runs.jsonl');
    try {
      const indexEntry: RunIndexEntry = {
        runId: this.entry.runId,
        tool: this.entry.toolName ?? '',
        projectPath: this.entry.projectPath,
        status: this.entry.status ?? 'success',
        startedAt: this.entry.timestamp ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: this.entry.durationMs,
      };
      appendFileSync(indexPath, JSON.stringify(indexEntry) + '\n', 'utf-8');
    } catch {
      // Non-fatal
    }
  }
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `... [truncated ${s.length - maxLen} chars]`;
}

/**
 * Get recent runs from the run index.
 */
export function getRecentRuns(projectPath: string, limit = 10): RunIndexEntry[] {
  const indexPath = join(projectPath, '.turpan', 'mcp-runs.jsonl');
  if (!existsSync(indexPath)) return [];
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: RunIndexEntry[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Get last error from audit log.
 */
export function getLastError(projectPath: string): string | null {
  const logPath = join(projectPath, '.turpan', 'mcp-audit.log');
  if (!existsSync(logPath)) return null;
  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i]);
      if (entry.status === 'failure' || entry.status === 'rejected') {
        return `${entry.errorCode ?? 'ERROR'}: ${entry.outputSummary}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write a stale concurrency-lock release event to the audit log.
 * Used by ConcurrencyGuard when an expired lock is auto-released.
 */
export function logStaleRelease(event: {
  workspace: string;
  runId: string;
  toolName: string;
  startedAt: string;
  expiresAt: string;
  releasedAt: string;
  reason: string;
  heldMs: number;
}): void {
  const entry = {
    timestamp: event.releasedAt,
    toolName: event.toolName,
    projectPath: event.workspace,
    workspace: event.workspace,
    runId: event.runId,
    inputSummary: {},
    outputSummary: `Concurrency lock released: ${event.reason}`,
    status: 'success' as AuditStatus,
    durationMs: event.heldMs,
    event: 'concurrency_lock_released',
    reason: event.reason,
    startedAt: event.startedAt,
    expiresAt: event.expiresAt,
    releasedAt: event.releasedAt,
    heldMs: event.heldMs,
  };

  const line = JSON.stringify(entry) + '\n';

  // Write to global log (rotation-safe)
  if (globalAuditPath) {
    try {
      checkAndRotate();
      appendFileSync(globalAuditPath, line, 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  // Write to workspace-scoped log
  if (event.workspace) {
    const runDir = join(event.workspace, '.turpan', 'runs', event.runId);
    const scopedLog = join(runDir, 'mcp-audit.jsonl');
    try {
      if (!existsSync(runDir)) {
        mkdirSync(runDir, { recursive: true });
      }
      appendFileSync(scopedLog, line, 'utf-8');
    } catch {
      // Non-fatal
    }
  }
}
