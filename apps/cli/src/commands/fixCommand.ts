/**
 * fixCommand.ts — `turpan fix` CLI command
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { runFixEngine, resolveFixMode, type CLIFixMode } from './fix.js';

export function createFixCommand(): Command {
  const cmd = new Command('fix');
  cmd.description('Apply safe code fixes based on findings from a prior review')
    .argument('[path]', 'Project path to fix', '.')
    .option('--patch-only', 'Generate patch diffs without applying (default)', false)
    .option('--apply', 'Apply fixes to the working tree', false)
    .option('--interactive', 'Ask before applying each fix', false)
    .option('--auto-safe', 'Automatically apply only safe fix categories', false)
    .option('--review', 'Run a new review first to collect findings', false)
    .option('--deep', 'Run deep review (used with --review)', false)
    .option('--timeout <seconds>', 'Timeout per command (used with --review)', '120')
    .option('--findings <file>', 'Path to a specific findings JSON file')
    .option('--skip-validation', 'Skip post-apply validation checks', false)
    .action(async (path: string, options: {
      patchOnly?: boolean;
      apply?: boolean;
      interactive?: boolean;
      autoSafe?: boolean;
      review?: boolean;
      deep?: boolean;
      timeout?: string;
      findings?: string;
      skipValidation?: boolean;
    }) => {
      const projectPath = resolve(process.cwd(), path);

      if (!existsSync(projectPath)) {
        console.error(chalk.red(`\n❌ Project path does not exist: ${projectPath}\n`));
        process.exit(1);
      }

      const fixMode = resolveFixMode({
        patchOnly: options.patchOnly,
        apply: options.apply,
        interactive: options.interactive,
        autoSafe: options.autoSafe,
        fix: false,
      });

      // Warn about conflicting options
      const modeCount = [options.patchOnly, options.apply, options.interactive, options.autoSafe]
        .filter(Boolean).length;
      if (modeCount > 1) {
        console.error(chalk.red(`\n❌ Conflicting options: choose only one of --patch-only, --apply, --interactive, --auto-safe\n`));
        process.exit(1);
      }

      // Default to patch-only if no mode specified
      const resolvedMode: CLIFixMode = options.apply
        ? 'apply'
        : options.interactive
        ? 'interactive'
        : options.autoSafe
        ? 'auto-safe'
        : 'patch-only';

      const timeoutMs = (parseInt(options.timeout ?? '120') || 120) * 1000;

      console.log(chalk.bold('\n🔧 Turpan Safe Fix\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim(`Mode:   ${chalk.cyan(resolvedMode)}\n`));

      if (resolvedMode === 'apply' || resolvedMode === 'auto-safe') {
        console.log(chalk.yellow('⚠️  This will modify files. Use '));
        console.log(chalk.yellow('⚠️  Make sure you have a backup or the git working tree is clean.\n'));
      }

      try {
        const result = await runFixEngine({
          projectRoot: projectPath,
          fixMode: resolvedMode,
          findingsPath: options.findings,
          runReviewFirst: options.review,
          reviewOptions: { deep: options.deep, timeoutMs },
          skipValidation: options.skipValidation,
        });

        const verdictColor = result.validation.allPassed ? chalk.green : chalk.red;
        const icon = result.validation.allPassed ? '✅' : '⚠️';

        console.log(chalk.bold(`\n${icon} Fix run complete`));
        console.log(chalk.dim(`   Mode: ${resolvedMode}`));
        console.log(`   Applied: ${chalk.green(String(result.applied.length))}`);
        console.log(`   Rejected: ${result.rejected.length}`);
        console.log(`   Deferred: ${result.deferred.length}`);
        console.log(`   Validation: ${verdictColor(result.validation.allPassed ? 'PASSED' : 'FAILED')}`);
        console.log();

        if (result.patchResult.filesModified.length > 0) {
          console.log(chalk.bold('Files modified:'));
          for (const f of result.patchResult.filesModified) {
            console.log(`   ${chalk.cyan(f)}`);
          }
          console.log();
        }

        if (result.rollback) {
          console.error(chalk.red('\n🚨 Rollback was triggered due to validation failure.\n'));
          process.exit(1);
        }

        if (!result.validation.allPassed) {
          console.error(chalk.yellow('\n⚠️  Some validations failed. Review the report for details.\n'));
          process.exit(1);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n❌ Fix run failed: ${msg}\n`));
        process.exit(1);
      }
    });

  return cmd;
}
