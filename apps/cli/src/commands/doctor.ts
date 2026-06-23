import { Command } from 'commander';
import chalk from 'chalk';
import { runDoctorCheck } from '@turpan/core';

export function createDoctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd.description('Check system requirements and environment').action(async () => {
    console.log(chalk.bold('\n🔍 Turpan Environment Check\n'));

    const result = await runDoctorCheck();

    for (const check of result.checks) {
      const icon = check.ok ? chalk.green('✓') : chalk.red('✗');
      const label = check.ok ? chalk.green('OK') : chalk.red('FAIL');
      console.log(`${icon} ${check.name}: ${check.message} ${chalk.dim(`[${label}]`)}`);
    }

    console.log();
    if (result.ok) {
      console.log(chalk.green('✅ All checks passed! Turpan is ready to use.\n'));
    } else {
      console.log(chalk.red('❌ Some checks failed. Please fix the issues above.\n'));
      process.exit(1);
    }
  });

  return cmd;
}