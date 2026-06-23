import { Command } from 'commander';
import chalk from 'chalk';
import { resolveProjectPath } from '@turpan/shared';
import { readJsonFile, fileExists } from '@turpan/shared';
import { join } from 'path';

export function createReportCommand(): Command {
  const cmd = new Command('report');
  cmd
    .description('Display the latest Turpan analysis report')
    .argument('[path]', 'Project path', '.')
    .action(async (path: string) => {
      const projectPath = resolveProjectPath(path);
      const latestPath = join(projectPath, '.turpan', 'runs', 'latest');
      const analysisPath = join(latestPath, 'TURPAN_ANALYSIS.md');
      const findingsPath = join(latestPath, 'TURPAN_FINDINGS.json');
      const scorecardPath = join(latestPath, 'TURPAN_SCORECARD.json');

      if (!fileExists(analysisPath)) {
        console.log(chalk.yellow('\n⚠ No analysis report found.\n'));
        console.log(chalk.dim('Run ' + chalk.cyan('turpan review .') + ' first.\n'));
        return;
      }

      try {
        const { readFileSync } = await import('fs');
        const analysis = readFileSync(analysisPath, 'utf-8');
        const findings = readJsonFile<unknown[]>(findingsPath) ?? [];
        const scorecard = readJsonFile<Record<string, unknown>>(scorecardPath);

        console.log(chalk.bold('\n📊 Turpan Report\n'));
        console.log(chalk.dim(`Project: ${projectPath}`));
        console.log(chalk.dim(`Run: ${latestPath}\n`));

        console.log(chalk.bold('--- Analysis ---'));
        console.log(analysis);

        if (scorecard) {
          console.log(chalk.bold('\n--- Scorecard ---'));
          console.log(JSON.stringify(scorecard, null, 2));
        }

        console.log(chalk.bold('\n--- Findings ---'));
        console.log(`Total: ${findings.length} findings`);
        console.log();
      } catch (error) {
        console.error(chalk.red(`\n❌ Failed to read report: ${error}\n`));
        process.exit(1);
      }
    });

  return cmd;
}