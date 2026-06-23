import { Command } from 'commander';
import chalk from 'chalk';
import { createDefaultConfig } from '@turpan/core';
import { resolveProjectPath } from '@turpan/shared';

export function createInitCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Initialize Turpan configuration in a project')
    .argument('[path]', 'Project path', '.')
    .action(async (path: string) => {
      const projectPath = resolveProjectPath(path);

      console.log(chalk.bold('\n🚀 Initializing Turpan\n'));
      console.log(chalk.dim(`Project: ${projectPath}\n`));

      const config = createDefaultConfig(projectPath);

      console.log(chalk.green('✅ Created turpan.yml'));
      console.log(chalk.dim(`  - Version: ${config.version}`));
      console.log(chalk.dim(`  - Log Level: ${config.logLevel}`));
      console.log(chalk.dim(`  - Run Path: ${config.runPath}\n`));

      console.log(chalk.bold('Next steps:'));
      console.log(`  ${chalk.cyan('turpan review .')}`);
      console.log(`  ${chalk.cyan('turpan')}\n`);
    });

  return cmd;
}