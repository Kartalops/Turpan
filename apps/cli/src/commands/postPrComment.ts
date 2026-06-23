/**
 * post-pr-comment command
 * turpan scripts post-pr-comment --run-path <path> --pr-number <num> [--dry-run]
 *
 * Posts or updates a sticky PR comment using the GitHub API.
 * Reads TURPAN_PR_COMMENT.md from the run path.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const STICKY_MARKER = '<!-- turpan-pr-review sticky comment -->';
const MAX_COMMENT_LENGTH = 65536;

export function createPostPrCommentCommand(): Command {
  const cmd = new Command('post-pr-comment');
  cmd
    .description('Post or update a sticky PR comment with Turpan review results')
    .requiredOption('--run-path <path>', 'Path to the Turpan run directory containing TURPAN_PR_COMMENT.md')
    .option('--pr-number <number>', 'PR number (for display only)', undefined)
    .option('--token <token>', 'GitHub token (or set GITHUB_TOKEN env var)', undefined)
    .option('--update', 'Update existing sticky comment (default: true)', true)
    .option('--dry-run', 'Print comment without posting', false)
    .action(async (options: {
      runPath: string;
      prNumber?: string;
      token?: string;
      update?: boolean;
      dryRun?: boolean;
    }) => {
      const runPath = options.runPath;
      const prCommentPath = join(runPath, 'TURPAN_PR_COMMENT.md');

      // ── Read comment file ──────────────────────────────────────────────────
      if (!existsSync(prCommentPath)) {
        console.error(chalk.red(`\n❌ TURPAN_PR_COMMENT.md not found at: ${prCommentPath}\n`));
        console.error(chalk.dim('  Run `turpan review . --from <base> --to <head>` first.\n'));
        process.exit(1);
      }

      let commentContent = readFileSync(prCommentPath, 'utf-8');

      // ── Validate token ─────────────────────────────────────────────────────
      const token = options.token ?? process.env.GITHUB_TOKEN;
      if (!options.dryRun && !token) {
        console.error(chalk.red('\n❌ GITHUB_TOKEN is required to post comments.\n'));
        console.error(chalk.dim('  Set the GITHUB_TOKEN environment variable or pass --token\n'));
        process.exit(1);
      }

      // ── Redact secrets from comment ────────────────────────────────────────
      commentContent = redactSecrets(commentContent);
      if (commentContent !== readFileSync(prCommentPath, 'utf-8')) {
        console.log(chalk.yellow('⚠️  Some secrets were redacted from the comment.\n'));
      }

      // ── Truncate if too long ───────────────────────────────────────────────
      const truncated = commentContent.length > MAX_COMMENT_LENGTH;
      if (truncated) {
        const excess = commentContent.length - MAX_COMMENT_LENGTH;
        console.log(chalk.yellow(`⚠️  Comment exceeds ${MAX_COMMENT_LENGTH} chars — truncating ${excess} chars\n`));
        // Keep the header + first part + footer
        const footer = '\n\n--- _(comment truncated — see full report in artifacts)_';
        commentContent = commentContent.slice(0, MAX_COMMENT_LENGTH - footer.length) + footer;
      }

      // ── Wrap with sticky marker ────────────────────────────────────────────
      const wrappedComment = `${STICKY_MARKER}\n\n${commentContent}\n\n${STICKY_MARKER}`;

      // ── Dry run ────────────────────────────────────────────────────────────
      if (options.dryRun) {
        console.log(chalk.bold('\n📋 Dry run — comment to be posted:\n'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log(wrappedComment);
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.dim(`\n(${wrappedComment.length} characters)\n`));
        return;
      }

      // ── Post comment ───────────────────────────────────────────────────────
      if (!token) {
        console.error(chalk.red('\n❌ No GitHub token available.\n'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🐪 Posting PR Comment\n'));
      if (options.prNumber) {
        console.log(chalk.dim(`PR: #${options.prNumber}`));
      }
      console.log(chalk.dim(`File: ${prCommentPath}`));
      console.log(chalk.dim(`Chars: ${wrappedComment.length}${truncated ? ' (truncated)' : ''}\n`));

      try {
        await postOrUpdateComment(token, wrappedComment, options.update ?? true);
        console.log(chalk.green('✅ PR comment posted successfully!\n'));
      } catch (err) {
        console.error(chalk.red(`\n❌ Failed to post comment: ${err instanceof Error ? err.message : err}\n`));
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Post a new PR comment or update an existing sticky one.
 */
async function postOrUpdateComment(token: string, comment: string, update: boolean): Promise<void> {
  const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const owner = process.env.GITHUB_REPOSITORY?.split('/')[0] ?? '';
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
  const prNumber = process.env.PR_NUMBER ?? '';

  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY env var not set — cannot determine repo for PR comment');
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // If update=true, try to find existing sticky comment
  if (update) {
    const existingId = await findStickyCommentId(token, owner, repo, prNumber, headers);
    if (existingId) {
      console.log(chalk.dim(`  Updating existing comment #${existingId}\n`));
      const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues/comments/${existingId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body: comment }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`PATCH /issues/comments/${existingId} failed: ${res.status} ${body}`);
      }
      return;
    }
    console.log(chalk.dim('  No existing sticky comment found — posting new comment\n'));
  }

  // Post new comment
  const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: comment }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /issues/${prNumber}/comments failed: ${res.status} ${body}`);
  }
}

/**
 * Find the ID of an existing sticky PR comment.
 */
async function findStickyCommentId(
  token: string,
  owner: string,
  repo: string,
  prNumber: string,
  headers: Record<string, string>
): Promise<number | null> {
  const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';

  const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) return null;

  const comments: Array<{ id: number; body: string }> = await res.json();
  for (const c of comments) {
    if (c.body.includes(STICKY_MARKER)) {
      return c.id;
    }
  }
  return null;
}

/**
 * Redact potential secrets from comment content.
 * Redacts: environment variable values, Bearer tokens, API keys, long hex strings.
 */
function redactSecrets(content: string): string {
  let redacted = content;

  // Redact Bearer tokens
  redacted = redacted.replace(/Bearer [\w.-]+/g, 'Bearer [REDACTED]');

  // Redact long hex strings that look like API keys/tokens (32+ hex chars)
  redacted = redacted.replace(/\b[0-9a-f]{32,}\b/gi, '[REDACTED_KEY]');

  // Redact environment variable assignments in code blocks
  redacted = redacted.replace(/(export\s+)?([A-Z_]+)=[^\s`]{8,}/g, '$2=[REDACTED]');

  // Redact URLs with embedded credentials
  redacted = redacted.replace(/https?:\/\/[^:]+:[^@]+@/g, 'https://[REDACTED]@');

  // Redact base64-encoded secrets (longer than 40 chars, no spaces)
  redacted = redacted.replace(/\b[A-Za-z0-9+/]{60,}={0,2}\b/g, '[REDACTED_SECRET]');

  return redacted;
}