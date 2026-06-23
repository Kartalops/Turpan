/**
 * review-diff command
 * turpan review-diff . --base main --target HEAD
 *
 * Dedicated diff-review command with explicit base/target flags.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { runAnalysis } from '@turpan/core';
import { GitDiffEngine } from '@turpan/git-diff';

export function createReviewDiffCommand(): Command {
  const cmd = new Command('review-diff');
  cmd
    .description('Run a diff-scoped review — analyze only what changed between two refs')
    .argument('[path]', 'Project path to review', '.')
    .requiredOption('--base <ref>', 'Base ref (branch, tag, commit) to diff from')
    .requiredOption('--target <ref>', 'Target ref (branch, tag, commit) to diff to')
    .option('--deep', 'Enable deep analysis', false)
    .option('--ui', 'Enable UI analysis', false)
    .option('--runtime', 'Enable runtime analysis', false)
    .option('--fix', 'Enable fix mode', false)
    .option('--plugins <list>', 'Comma-separated plugin list', undefined)
    .option('--timeout <seconds>', 'Timeout per command', '120')
    .option('--fail-on <level>', 'Exit code policy: critical, high, never', 'never')
    .action(async (path: string, options: {
      base: string;
      target: string;
      deep?: boolean;
      ui?: boolean;
      runtime?: boolean;
      fix?: boolean;
      plugins?: string;
      timeout?: string;
      failOn?: string;
    }) => {
      const projectPath = resolve(process.cwd(), path);
      const baseRef = options.base;
      const targetRef = options.target;
      const timeoutMs = (parseInt(options.timeout ?? '120') || 120) * 1000;

      console.log(chalk.bold('\n🔍 Turpan Diff Review\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim(`Diff: ${baseRef} → ${targetRef}`));
      console.log(chalk.cyan('⏳ Computing diff…\n'));

      let diffResult: import('@turpan/git-diff').GitDiffResult;
      try {
        const engine = new GitDiffEngine(projectPath);
        diffResult = engine.getDiff(baseRef, targetRef);
        if (diffResult.refError) {
          console.error(chalk.red(`\n❌ ${diffResult.refError}\n`));
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`\n❌ Failed to get git diff: ${err instanceof Error ? err.message : err}\n`));
        process.exit(1);
      }

      const s = diffResult.stats;
      console.log(chalk.green(`  ${s.filesAdded} added | ${s.filesModified} modified | ${s.filesDeleted} deleted | ${s.filesRenamed} renamed`));
      console.log(chalk.dim(`  +${s.totalLinesAdded} / -${s.totalLinesDeleted} lines\n`));

      if (diffResult.hasWorkingTreeChanges) {
        console.log(chalk.yellow('  ⚠️  Warning: working tree has uncommitted changes\n'));
      }

      if (diffResult.files.length > 0) {
        console.log(chalk.bold('  Changed files:'));
        for (const f of diffResult.files.slice(0, 30)) {
          const icon = f.changeType === 'added' ? '✨' :
                       f.changeType === 'deleted' ? '🗑️' :
                       f.changeType === 'renamed' ? '📝' : '📄';
          console.log(`    ${icon} ${f.changeType.padEnd(10)} ${f.path}`);
        }
        if (diffResult.files.length > 30) {
          console.log(chalk.dim(`    … and ${diffResult.files.length - 30} more files\n`));
        }
        console.log();
      }

      console.log(chalk.cyan('⏳ Running diff-scoped analysis…\n'));
      let runPath: string;
      try {
        runPath = await runAnalysis({
          projectPath,
          deepAnalysis: options.deep ?? false,
          uiAnalysis: options.ui ?? false,
          fixMode: options.fix ?? false,
          timeoutMs,
          skipRuntime: !options.runtime,
          plugins: options.plugins ? options.plugins.split(',').map(p => p.trim()).filter(Boolean) : undefined,
          diffMode: true,
          diffResult,
          diffBaseRef: baseRef,
          diffTargetRef: targetRef,
        });
      } catch (err) {
        console.error(chalk.red(`\n❌ Diff review failed: ${err instanceof Error ? err.message : err}\n`));
        process.exit(1);
      }

      process.stdout.write('\r');
      console.log(chalk.green('✅ Diff review complete!\n'));
      console.log(chalk.dim(`Reports at: ${runPath}\n`));
      console.log(`  ${chalk.cyan('TURPAN_ANALYSIS.md')}       — full analysis`);
      console.log(`  ${chalk.cyan('TURPAN_PR_COMMENT.md')}     — GitHub PR comment`);
      console.log(`  ${chalk.cyan('TURPAN_DIFF_FINDINGS.json')} — CI-friendly JSON\n`);

      // Exit code policy
      const failOn = options.failOn ?? 'never';
      if (failOn !== 'never') {
        const findingsPath = join(runPath, 'TURPAN_FINDINGS.json');
        if (existsSync(findingsPath)) {
          try {
            const data = JSON.parse(readFileSync(findingsPath, 'utf-8'));
            const findings: Array<{ severity: string }> = data.findings ?? [];
            const critical = findings.filter(f => f.severity === 'critical').length;
            const high = findings.filter(f => f.severity === 'high').length;
            const shouldFail = (failOn === 'critical' && critical > 0) ||
                               (failOn === 'high' && (critical > 0 || high > 0));
            if (shouldFail) {
              console.log(chalk.red(`\n❌ Exit policy: --fail-on ${failOn} triggered by ` +
                `${critical > 0 ? `${critical} critical finding(s)` : `${high} high finding(s)`}\n`));
              process.exit(1);
            }
          } catch {}
        }
      }
    });

  return cmd;
}