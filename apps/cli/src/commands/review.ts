import { Command } from 'commander';
import chalk from 'chalk';
import { runAnalysis } from '@turpan/core';
import { resolveProjectPath } from '@turpan/shared';

export function createReviewCommand(): Command {
  const cmd = new Command('review');
  cmd
    .description('Run code review on a project')
    .argument('[path]', 'Project path to analyze', '.')
    .option('-d, --deep', 'Enable deep analysis (includes static quality, dead code, security checks)', false)
    .option('-q, --quality', 'Run static code quality analyzers only (unused deps, placeholders, complexity, architecture)', false)
    .option('-u, --ui', 'Enable UI analysis', false)
    .option('-r, --runtime', 'Enable runtime review (Python bots, FastAPI, Node backends, CLI, workers, MCP servers)', false)
    .option('-f, --fix', 'Enable fix mode (produces patch plans only)', false)
    .option('-p, --plugins <plugins>', 'Comma-separated list of plugins to enable (e.g. saas,security,next)', undefined)
    .option('-s, --scenarios <scenarios>', 'Comma-separated list of UI test scenarios to run (e.g. auth,marketing,billing). Omit for all supported.', undefined)
    .option('--skip-scenarios', 'Skip real scenario library execution in UI tests', false)
    .option('--dependency-audit', 'Include dependency CVE scan and license audit', false)
    .option('--online', 'Enable online CVE scanning (OSV/npm audit) — only used with --dependency-audit', false)
    .action(async (path: string, options: { deep?: boolean; quality?: boolean; ui?: boolean; runtime?: boolean; fix?: boolean; plugins?: string; dependencyAudit?: boolean; online?: boolean }) => {
      const projectPath = resolveProjectPath(path);

      const modeDesc = options.quality
        ? 'static code quality & cleanup'
        : options.deep
          ? 'deep (includes quality & cleanup)'
          : 'standard';

      // Parse plugins list
      const enabledPlugins = options.plugins
        ? options.plugins.split(',').map(p => p.trim()).filter(Boolean)
        : undefined;

      const enabledScenarios = options.scenarios
        ? options.scenarios.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;

      const auditMode = options.dependencyAudit
        ? options.online ? chalk.yellow(' + dependency-audit(online)') : ' + dependency-audit(offline)'
        : '';
      console.log(chalk.bold('\n🔍 Turpan Review\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim(`Mode: ${modeDesc}${options.ui ? ' + UI' : ''}${options.runtime ? ' + Runtime' : ''}${options.fix ? ' + fix' : ''}${auditMode}`));
      if (enabledPlugins) {
        console.log(chalk.dim(`Plugins: ${chalk.cyan(enabledPlugins.join(', '))}`));
      } else {
        console.log(chalk.dim('Plugins: auto-detect'));
      }
      console.log();

      try {
        console.log(chalk.cyan('⏳ Analyzing...\n'));

        if (options.quality) {
          // Quality-only: deep analysis focused on static quality
          const runPath = await runAnalysis({
            projectPath,
            isInteractive: false,
            deepAnalysis: true,
            skipBuild: true,
            skipTests: true,
            skipLint: true,
            skipTypecheck: true,
            skipSecurity: true,
            skipUi: true,
            skipRuntime: true,
            plugins: enabledPlugins,
            uiScenarios: enabledScenarios,
            skipScenarios: true,
            dependencyAudit: options.dependencyAudit,
            dependencyAuditOnline: options.online,
          });
          process.stdout.write('\r');
          console.log(chalk.green('✅ Quality analysis complete!\n'));
          console.log(chalk.dim(`Reports at: ${runPath}\n`));
        } else {
          const runPath = await runAnalysis({
            projectPath,
            isInteractive: false,
            deepAnalysis: options.deep ?? false,
            uiAnalysis: options.ui ?? false,
            fixMode: options.fix ?? false,
            skipRuntime: !options.runtime,
            plugins: enabledPlugins,
            uiScenarios: enabledScenarios,
            skipScenarios: options.skipScenarios ?? false,
            dependencyAudit: options.dependencyAudit,
            dependencyAuditOnline: options.online,
          });
          process.stdout.write('\r');
          console.log(chalk.green('✅ Analysis complete!\n'));
          console.log(chalk.dim(`Reports written to: ${runPath}\n`));
          console.log(`  ${chalk.cyan('TURPAN_ANALYSIS.md')}`);
          console.log(`  ${chalk.cyan('TURPAN_FINDINGS.json')}`);
          console.log(`  ${chalk.cyan('TURPAN_SCORECARD.json')}\n`);
          if (options.runtime) {
            console.log(chalk.green('✅ Runtime Review section included in analysis.\n'));
          }
          if (enabledPlugins) {
            console.log(chalk.green(`✅ Plugin review enabled: ${chalk.cyan(enabledPlugins.join(', '))}\n`));
          }
          if (options.dependencyAudit) {
            const mode = options.online ? 'online' : 'offline';
            console.log(chalk.green(`✅ Dependency audit included (${mode} mode).\n`));
          }
        }
      } catch (error) {
        process.stdout.write('\r');
        console.error(chalk.red(`\n❌ Analysis failed: ${error}\n`));
        process.exit(1);
      }
    });

  return cmd;
}