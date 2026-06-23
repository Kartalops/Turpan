/**
 * cleanup-scan command — runs static analyzers and reports cleanup candidates.
 * Does NOT delete anything; only reports findings and safe/risky cleanup candidates.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { runAnalysis } from '@turpan/core';
import { resolveProjectPath } from '@turpan/shared';

export function createCleanupScanCommand(): Command {
  const cmd = new Command('cleanup-scan');
  cmd
    .description('Scan for cleanup candidates (unused code, placeholders, dead code) — read-only, no deletions')
    .argument('[path]', 'Project path to scan', '.')
    .option('--deep', 'Run deep analysis including architecture checks', false)
    .action(async (path: string, options: { deep?: boolean }) => {
      const projectPath = resolveProjectPath(path);

      console.log(chalk.bold('\n🧹 Turpan Cleanup Scan\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim('Mode: read-only scan — no files will be deleted\n'));

      console.log(chalk.cyan('🔍 Scanning for cleanup candidates...\n'));

      try {
        const runPath = await runAnalysis({
          projectPath,
          isInteractive: false,
          deepAnalysis: options.deep ?? false,
          skipBuild: true,
          skipTests: true,
          skipLint: true,
          skipTypecheck: true,
          skipSecurity: true,
        });

        process.stdout.write('\r');
        console.log(chalk.green('✅ Cleanup scan complete!\n'));
        console.log(chalk.dim(`Reports written to: ${runPath}\n`));
        console.log(`  ${chalk.cyan('TURPAN_ANALYSIS.md')} — contains Code Quality & Cleanup section`);
        console.log(`  ${chalk.cyan('TURPAN_FINDINGS.json')} — all findings in JSON form`);
        console.log(`  ${chalk.cyan('TURPAN_SCORECARD.json')}\n`);

        console.log(chalk.bold('Report sections:'));
        console.log(`  ${chalk.cyan('•')} Code Quality & Cleanup`);
        console.log(`  ${chalk.cyan('•')} Safe Cleanup Candidates`);
        console.log(`  ${chalk.cyan('•')} Risky Cleanup Candidates`);
        console.log(`  ${chalk.cyan('•')} Agent-like Implementation Smells\n`);
      } catch (error) {
        process.stdout.write('\r');
        console.error(chalk.red(`\n❌ Cleanup scan failed: ${error}\n`));
        process.exit(1);
      }
    });

  return cmd;
}
