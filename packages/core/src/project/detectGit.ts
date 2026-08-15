/**
 * Detect Git
 * Enhanced git repository detection with more metadata
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { isGitRepository } from '@turpan/shared';

export interface GitStatus {
  isGitRepo: boolean;
  branch?: string;
  commitHash?: string;
  isDirty?: boolean;
  rootDir?: string;
  tags?: string[];
  remotes?: string[];
}

export function detectGit(projectRoot: string): GitStatus {
  const isRepo = isGitRepository(projectRoot);

  if (!isRepo) {
    return { isGitRepo: false };
  }

  try {
    const rootDir = execSync('git rev-parse --show-toplevel', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();

    // A fixture or nested directory can live inside a repository without being
    // a repository boundary itself. Review git metadata only for the selected
    // project root, not an unrelated parent checkout.
    if (resolve(rootDir) !== resolve(projectRoot)) {
      return { isGitRepo: false };
    }

    const branch = execSync('git branch --show-current', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();

    const commitHash = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim().slice(0, 8);

    const status = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();

    // Get tags
    let tags: string[] = [];
    try {
      const tagOutput = execSync('git tag --points-at HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
      }).trim();
      tags = tagOutput ? tagOutput.split('\n').filter(Boolean) : [];
    } catch {
      // No tags or error
    }

    // Get remotes
    let remotes: string[] = [];
    try {
      const remoteOutput = execSync('git remote', {
        cwd: projectRoot,
        encoding: 'utf-8',
      }).trim();
      remotes = remoteOutput ? remoteOutput.split('\n').filter(Boolean) : [];
    } catch {
      // No remotes or error
    }

    return {
      isGitRepo: true,
      branch,
      commitHash,
      isDirty: status.length > 0,
      rootDir,
      tags,
      remotes,
    };
  } catch {
    return { isGitRepo: false };
  }
}

/**
 * Get a short git status summary
 */
export function getGitSummary(status: GitStatus): string {
  if (!status.isGitRepo) {
    return 'Not a git repository';
  }

  const parts = [`${status.branch} @ ${status.commitHash}`];

  if (status.isDirty) {
    parts.push('dirty');
  }

  if (status.tags && status.tags.length > 0) {
    parts.push(`tag: ${status.tags[0]}`);
  }

  return parts.join(' | ');
}
