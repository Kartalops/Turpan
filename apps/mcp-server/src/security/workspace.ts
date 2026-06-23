/**
 * Workspace validation — prevents path traversal and validates project paths.
 *
 * Security guarantees:
 * - projectPath must resolve to within an allowed workspace root
 * - Path traversal attacks (../) are blocked
 * - Output paths are always scoped to .turpan/runs/ within the project
 */

import { resolve, isAbsolute, join, normalize } from 'path';
import { existsSync, statSync } from 'fs';

export interface WorkspaceAllowlist {
  roots: string[];      // allowed workspace root directories
  requireExists: boolean;
}

export interface ValidatedPath {
  original: string;
  resolved: string;     // absolute, normalized path
  workspaceRoot: string;
  isWithinWorkspace: boolean;
}

const DEFAULT_ALLOWLIST: WorkspaceAllowlist = {
  roots: [],
  requireExists: true,
};

let currentAllowlist: WorkspaceAllowlist = { ...DEFAULT_ALLOWLIST };

/**
 * Configure the workspace allowlist. Call before starting the server.
 * @param roots Absolute paths to allowed workspace directories
 */
export function setWorkspaceAllowlist(roots: string[]): void {
  currentAllowlist = {
    roots: roots.map(r => resolve(r)),
    requireExists: true,
  };
}

/**
 * Get current allowlist roots.
 */
export function getWorkspaceAllowlist(): string[] {
  return [...currentAllowlist.roots];
}

/**
 * Check if a path is within any allowed workspace root.
 * Returns the matching root, or null if not allowed.
 */
export function findWorkspaceRoot(targetPath: string): string | null {
  const abs = isAbsolute(targetPath) ? targetPath : resolve(process.cwd(), targetPath);
  const normalized = normalize(abs);

  for (const root of currentAllowlist.roots) {
    const normalizedRoot = normalize(root);
    if (
      normalized === normalizedRoot ||
      normalized.startsWith(normalizedRoot + '/') ||
      normalized.startsWith(normalizedRoot + '\\')
    ) {
      return normalizedRoot;
    }
  }

  // If no allowlist configured, allow any path (backward compat for CLI usage)
  if (currentAllowlist.roots.length === 0) {
    return null;
  }

  return null;
}

/**
 * Validate and resolve a project path.
 * - Blocks path traversal
 * - Verifies path exists (optional)
 * - Checks workspace allowlist
 */
export function validateProjectPath(inputPath: string): ValidatedPath {
  const abs = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
  const normalized = normalize(abs);

  // Block path traversal — normalize must not contain ..
  // Normalize all separators to forward slash, then check for ..
  const normalizedForward = normalized.replace(/\\/g, '/');
  if (normalizedForward.includes('..')) {
    throw new PathTraversalError(`Path traversal detected: ${inputPath}`);
  }

  if (currentAllowlist.requireExists && !existsSync(normalized)) {
    throw new InvalidPathError(`Project path does not exist: ${inputPath}`);
  }

  if (currentAllowlist.roots.length > 0) {
    const wsRoot = findWorkspaceRoot(normalized);
    if (!wsRoot) {
      throw new WorkspaceViolationError(
        `Project path "${inputPath}" is not within any allowed workspace. ` +
        `Allowed roots: ${currentAllowlist.roots.join(', ')}`
      );
    }
    return {
      original: inputPath,
      resolved: normalized,
      workspaceRoot: wsRoot,
      isWithinWorkspace: true,
    };
  }

  return {
    original: inputPath,
    resolved: normalized,
    workspaceRoot: '',
    isWithinWorkspace: true,
  };
}

/**
 * Validate a task file path — must be within the project.
 */
export function validateTaskFilePath(taskPath: string, projectPath: string): ValidatedPath {
  const abs = isAbsolute(taskPath) ? taskPath : resolve(projectPath, taskPath);
  const normalized = normalize(abs);

  // Must be within projectPath
  const projNormalized = normalize(projectPath);
  if (
    !normalized.startsWith(projNormalized + '/') &&
    !normalized.startsWith(projNormalized + '\\')
  ) {
    throw new PathTraversalError(
      `Task file "${taskPath}" is outside project directory`
    );
  }

  return {
    original: taskPath,
    resolved: normalized,
    workspaceRoot: '',
    isWithinWorkspace: true,
  };
}

/**
 * Validate runId — must be a simple timestamp/ID without special chars.
 */
export function validateRunId(runId: string): void {
  if (!/^[a-zA-Z0-9_:-]+$/.test(runId)) {
    throw new InvalidPathError(`Invalid runId format: ${runId}`);
  }
  if (runId.length > 128) {
    throw new InvalidPathError(`runId too long: ${runId.length} > 128`);
  }
}

/**
 * Resolve an output path within the .turpan/runs/ directory of a project.
 * Output paths are ALWAYS scoped there — no arbitrary file writes.
 */
export function resolveOutputPath(projectPath: string, runId: string, filename: string): string {
  validateRunId(runId);
  // filename must not contain path separators
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new PathTraversalError(`Invalid filename: ${filename}`);
  }
  const runDir = join(projectPath, '.turpan', 'runs', runId);
  return join(runDir, filename);
}

/**
 * Get the latest run directory for a project.
 */
export function getLatestRunPath(projectPath: string): string | null {
  const { join } = require('path');
  const { existsSync, readlinkSync } = require('fs');
  const latest = join(projectPath, '.turpan', 'runs', 'latest');
  if (!existsSync(latest)) return null;
  try {
    return readlinkSync(latest);
  } catch {
    return latest;
  }
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export class PathTraversalError extends Error {
  readonly code = 'PATH_TRAVERSAL';
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

export class WorkspaceViolationError extends Error {
  readonly code = 'WORKSPACE_VIOLATION';
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceViolationError';
  }
}

export class InvalidPathError extends Error {
  readonly code = 'INVALID_PATH';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPathError';
  }
}