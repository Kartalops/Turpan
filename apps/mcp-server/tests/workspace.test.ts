/**
 * Workspace validation tests — path traversal, allowlist, and security checks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  validateProjectPath,
  validateTaskFilePath,
  validateRunId,
  resolveOutputPath,
  PathTraversalError,
  WorkspaceViolationError,
  InvalidPathError,
  setWorkspaceAllowlist,
  findWorkspaceRoot,
} from '../src/security/workspace.js';

const TEST_ROOT = '/tmp/turpan-mcp-test';

function setupTmpProject(name: string): string {
  const dir = join(TEST_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}');
  return dir;
}

describe('validateProjectPath', () => {
  beforeEach(() => {
    setWorkspaceAllowlist([TEST_ROOT]);
  });

  afterEach(() => {
    setWorkspaceAllowlist([]);
  });

  it('accepts a valid project path within allowlist', () => {
    const projectDir = setupTmpProject('my-project');
    const result = validateProjectPath(projectDir);
    expect(result.resolved).toBe(projectDir);
    expect(result.isWithinWorkspace).toBe(true);
  });

  it('accepts an existing path when no allowlist is set', () => {
    setWorkspaceAllowlist([]);
    const dir = setupTmpProject('any-project');
    const result = validateProjectPath(dir);
    expect(result.isWithinWorkspace).toBe(true);
  });

  it('blocks path traversal with ..', () => {
    setupTmpProject('my-project');
    // This path normalizes to /tmp/turpan-mcp-test which is in the allowlist,
    // but the raw input contains traversal. The traversal check fires on the
    // normalized path which resolves to /tmp/turpan-mcp-test/../../../etc/passwd
    // = /etc/passwd — still a valid path but outside workspace → WorkspaceViolationError
    expect(() => validateProjectPath(`${TEST_ROOT}/my-project/../../../etc/passwd`))
      .toThrow(WorkspaceViolationError);
  });

  it('blocks traversal when path resolves outside workspace', () => {
    const otherDir = join(TEST_ROOT, '..', 'turpan-mcp-test-sibling');
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'package.json'), '{}');
    expect(() => validateProjectPath(otherDir))
      .toThrow(WorkspaceViolationError);
  });

  it('blocks traversal when workspace is configured', () => {
    const outsideDir = '/tmp/outside-workspace';
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, 'package.json'), '{}');
    expect(() => validateProjectPath(outsideDir)).toThrow(WorkspaceViolationError);
  });

  it('throws InvalidPathError for non-existent path', () => {
    expect(() => validateProjectPath('/tmp/this-does-not-exist-12345'))
      .toThrow(InvalidPathError);
  });
});

describe('validateTaskFilePath', () => {
  const projectDir = setupTmpProject('task-test-project');

  it('accepts a task file within the project', () => {
    const taskFile = join(projectDir, '.turpan', 'task.md');
    mkdirSync(join(projectDir, '.turpan'), { recursive: true });
    writeFileSync(taskFile, 'task content');
    const result = validateTaskFilePath(taskFile, projectDir);
    expect(result.resolved).toBe(taskFile);
  });

  it('accepts a relative task file path', () => {
    const result = validateTaskFilePath('.turpan/task.md', projectDir);
    expect(result.resolved).toBe(join(projectDir, '.turpan', 'task.md'));
  });

  it('blocks task file outside project directory', () => {
    const otherDir = join(TEST_ROOT, 'other-project');
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, 'task.md'), 'task');
    expect(() => validateTaskFilePath(join(otherDir, 'task.md'), projectDir))
      .toThrow(PathTraversalError);
  });
});

describe('validateRunId', () => {
  it('accepts valid run IDs', () => {
    for (const id of [
      '2026-06-20T10-00-00-000Z',
      'latest',
      'run_123',
      'feature-branch-abc',
      'RUN-2026-06',
    ]) {
      expect(() => validateRunId(id)).not.toThrow();
    }
  });

  it('rejects run IDs with path traversal characters', () => {
    for (const id of ['../../../etc', '../run', 'run;rm', 'run|pipe', 'run`cmd`', 'run\ncmd']) {
      expect(() => validateRunId(id)).toThrow(InvalidPathError);
    }
  });

  it('rejects run IDs longer than 128 chars', () => {
    const longId = 'a'.repeat(129);
    expect(() => validateRunId(longId)).toThrow(InvalidPathError);
  });

  it('accepts exactly 128-char run ID', () => {
    const id = 'a'.repeat(128);
    expect(() => validateRunId(id)).not.toThrow();
  });
});

describe('resolveOutputPath', () => {
  it('resolves filenames within .turpan/runs/<runId>/', () => {
    const outPath = resolveOutputPath('/tmp/test-project', '2026-06-20T10-00-00-000Z', 'TURPAN_PATCH.diff');
    expect(outPath).toBe('/tmp/test-project/.turpan/runs/2026-06-20T10-00-00-000Z/TURPAN_PATCH.diff');
  });

  it('blocks path separators in filename', () => {
    expect(() => resolveOutputPath('/tmp/test', 'latest', '../etc/passwd'))
      .toThrow(PathTraversalError);
  });

  it('blocks backslash path separators in filename', () => {
    expect(() => resolveOutputPath('/tmp/test', 'latest', '..\\etc\\passwd'))
      .toThrow(PathTraversalError);
  });

  it('blocks .. in filename', () => {
    expect(() => resolveOutputPath('/tmp/test', 'latest', 'foo..bar'))
      .toThrow(PathTraversalError);
  });
});

describe('findWorkspaceRoot', () => {
  beforeEach(() => {
    setWorkspaceAllowlist([TEST_ROOT, '/home/oguz/projects']);
  });

  afterEach(() => {
    setWorkspaceAllowlist([]);
  });

  it('finds the matching workspace root', () => {
    const root = findWorkspaceRoot(join(TEST_ROOT, 'my-project'));
    expect(root).toBe(TEST_ROOT);
  });

  it('returns null for path outside all workspaces', () => {
    const root = findWorkspaceRoot('/opt/other-project');
    expect(root).toBeNull();
  });

  it('returns null when no allowlist configured', () => {
    setWorkspaceAllowlist([]);
    const root = findWorkspaceRoot('/tmp/any-project');
    expect(root).toBeNull();
  });
});