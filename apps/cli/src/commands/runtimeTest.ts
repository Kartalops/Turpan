import { Command } from 'commander';
import chalk from 'chalk';
import { detectProject } from '@turpan/core';
import { resolveProjectPath } from '@turpan/shared';

/**
 * Run runtime-specific review for Python bots, FastAPI, Node backends,
 * CLI tools, workers, and MCP servers.
 */
export function createRuntimeTestCommand(): Command {
  const cmd = new Command('runtime-test');
  cmd
    .description('Run runtime safety review for Python bots, FastAPI, CLI tools, workers, and MCP servers')
    .argument('[path]', 'Project path to test', '.')
    .option('--runtime', 'Enable runtime analyzers (Python, FastAPI, Node, CLI, Worker, MCP)', true)
    .action(async (path: string, options: { runtime?: boolean }) => {
      const projectPath = resolveProjectPath(path);

      console.log(chalk.bold('\n🐪 Turpan Runtime Test\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim('Mode: Non-UI runtime review\n'));
      console.log(chalk.cyan('⏳ Analyzing runtime characteristics...\n'));

      try {
        const fingerprint = detectProject(projectPath);
        const runtimeTypes: string[] = [];
        if (fingerprint.languages.includes('python')) runtimeTypes.push('Python');
        if (fingerprint.appType === 'fastapi' || fingerprint.backendFramework === 'fastapi') runtimeTypes.push('FastAPI');
        if (fingerprint.appType === 'python-bot' || fingerprint.appType === 'telegram-bot') runtimeTypes.push('Python Bot');
        if (fingerprint.appType === 'node-backend') runtimeTypes.push('Node Backend');
        if (fingerprint.entrypoints.some(e => e.type === 'cli')) runtimeTypes.push('CLI');
        if (fingerprint.appType === 'mcp-server') runtimeTypes.push('MCP Server');

        console.log(chalk.bold('Runtime Profile:'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(`  Languages:  ${fingerprint.languages.join(', ')}`);
        console.log(`  App Type:   ${fingerprint.appType}`);
        console.log(`  Detected:   ${runtimeTypes.length > 0 ? runtimeTypes.join(', ') : 'standard project'}`);
        console.log(`  Entrypoints: ${fingerprint.entrypoints.map(e => e.name).join(', ') || 'none'}`);
        console.log(chalk.dim('─'.repeat(40) + '\n'));

        // Check what runtime analyzers would apply
        const { runAnalysis } = await import('@turpan/core');
        const runPath = await runAnalysis({
          projectPath,
          isInteractive: false,
          deepAnalysis: false,
          skipBuild: true,
          skipTests: true,
          skipLint: true,
          skipTypecheck: true,
          skipSecurity: true,
          skipUi: true,
        });

        process.stdout.write('\r');
        console.log(chalk.bold('🐪 Runtime Test Complete\n'));
        console.log(chalk.green('✅ Non-UI runtime review finished!\n'));
        console.log(chalk.dim(`Reports at: ${runPath}\n`));
        console.log(`  ${chalk.cyan('TURPAN_ANALYSIS.md')}    — Runtime Review section`);
        console.log(`  ${chalk.cyan('TURPAN_FINDINGS.json')}   — All findings\n`);
        console.log(chalk.dim('Note: Runtime analyzers run Python import checks, FastAPI endpoint probes,\n'));
        console.log(chalk.dim('      CLI help/version validation, Worker pattern checks, and MCP security audits.\n'));
        console.log(chalk.dim('      No destructive commands are executed.\n'));

      } catch (error) {
        process.stdout.write('\r');
        console.error(chalk.red(`\n❌ Runtime test failed: ${error}\n`));
        process.exit(1);
      }
    });

  return cmd;
}
