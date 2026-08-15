import chalk from 'chalk';
import inquirer from 'inquirer';
import { detectProject, formatFingerprintSummary, type ProjectFingerprint } from '@turpan/core';
import { parseCommand, getIntentLabel, getAvailableCommands, type Intent } from './intent.js';
import { runAnalysis } from '@turpan/core';

const TURPAN_PROMPT = chalk.cyan('turpan') + chalk.dim(' > ');

export async function runInteractiveShell(projectPath: string): Promise<void> {
  const project = detectProject(projectPath);

  printGreeting();
  printProjectInfo(project);
  printAvailableCommands();

  let running = true;

  while (running) {
    try {
      const { command } = await inquirer.prompt<{ command: string }>([
        {
          type: 'input',
          name: 'command',
          message: TURPAN_PROMPT,
          prefix: '',
          transformer: (input: string) => input,
        },
      ]);

      if (!command.trim()) {
        continue;
      }

      const parsed = parseCommand(command);
      running = await handleCommand(parsed, project);
    } catch (error) {
      if ((error as { code?: string }).code === 'EXIT') {
        running = false;
      } else {
        console.error(chalk.red(`\nError: ${error}\n`));
      }
    }
  }

  console.log(chalk.dim('\n👋 Goodbye!\n'));
}

function printGreeting(): void {
  console.log(chalk.bold('\n🐪 Welcome to Turpan'));
  console.log(chalk.dim('  Interactive Review & Fix Agent\n'));
  console.log(chalk.dim('  Type a command or "help" for available commands.\n'));
}

function printProjectInfo(project: ProjectFingerprint): void {
  console.log(chalk.bold('📁 Project Detected'));
  console.log(chalk.dim('─'.repeat(40)));

  const lines = formatFingerprintSummary(project).split('\n');
  for (const line of lines) {
    console.log('  ' + line);
  }

  console.log(chalk.dim('─'.repeat(40) + '\n'));
}

function printAvailableCommands(): void {
  console.log(chalk.bold('Available Commands:'));
  const commands = getAvailableCommands();
  for (const cmd of commands) {
    console.log(`  ${chalk.cyan('•')} ${cmd}`);
  }
  console.log();
}

async function handleCommand(parsed: { intent: Intent; raw: string; args: string[]; flags: Record<string, string | boolean> }, project: ProjectFingerprint): Promise<boolean> {
  switch (parsed.intent) {
    case 'analyze':
    case 'review':
    case 'test':
    case 'ui':
    case 'fix':
    case 'report': {
      const isDeep = parsed.intent === 'analyze' || parsed.raw.toLowerCase().includes('deep');
      const isUi = parsed.intent === 'ui';

      console.log(chalk.cyan(`\n⏳ Running ${getIntentLabel(parsed.intent)}...\n`));
      try {
        const runPath = await runAnalysis({
          projectPath: project.projectRoot,
          isInteractive: true,
          deepAnalysis: isDeep || parsed.intent === 'analyze',
          uiAnalysis: isUi,
          fixMode: parsed.intent === 'fix',
        });
        console.log(chalk.green(`\n✅ ${getIntentLabel(parsed.intent)} complete!`));
        console.log(chalk.dim(`   Reports at: ${runPath}\n`));
      } catch (error) {
        console.error(chalk.red(`\n❌ ${getIntentLabel(parsed.intent)} failed: ${error}\n`));
      }
      return true;
    }

    case 'clean':
    case 'cleanup-scan':
    case 'quality':
    case 'find-unused':
    case 'detect-fake': {
      console.log(chalk.cyan(`\n⏳ Running ${getIntentLabel(parsed.intent)}...\n`));
      try {
        const runPath = await runAnalysis({
          projectPath: project.projectRoot,
          isInteractive: true,
          deepAnalysis: true,
          skipBuild: true,
          skipTests: true,
          skipLint: true,
          skipTypecheck: true,
          skipSecurity: true,
        });
        console.log(chalk.green(`\n✅ ${getIntentLabel(parsed.intent)} complete!`));
        console.log(chalk.dim(`   Reports at: ${runPath}\n`));
      } catch (error) {
        console.error(chalk.red(`\n❌ ${getIntentLabel(parsed.intent)} failed: ${error}\n`));
      }
      return true;
    }

    case 'exit':
      return false;

    case 'unknown':
    default:
      if (parsed.raw.toLowerCase() === 'help') {
        printAvailableCommands();
      } else {
        console.log(chalk.yellow(`\nUnknown command: "${parsed.raw}"`));
        console.log(chalk.dim('Type "help" for available commands.\n'));
      }
      return true;
  }
}
