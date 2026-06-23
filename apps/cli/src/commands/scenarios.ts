/**
 * Scenarios CLI commands:
 *  - turpan scenarios list
 *  - turpan scenarios run [scenarioId]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { scenarioRegistry } from '@turpan/ui-runner';

/**
 * Create the `scenarios` subcommand.
 */
export function createScenariosCommand(): Command {
  const cmd = new Command('scenarios');
  cmd.description('UI test scenario management');

  // ── scenarios list ─────────────────────────────────────────────────────────
  const listCmd = new Command('list');
  listCmd
    .description('List all available UI test scenarios')
    .option('--json', 'Output as JSON', false)
    .action(async (options: { json?: boolean }) => {
      const scenarios = scenarioRegistry.list();

      if (options.json) {
        console.log(JSON.stringify({ scenarios }, null, 2));
        return;
      }

      console.log(chalk.bold('\n🎭 Turpan UI Test Scenarios\n'));

      const grouped = scenarios.reduce((acc, s) => {
        const category = s.id.split('-')[0]; // e.g. 'saas' from 'saas-marketing'
        if (!acc[category]) acc[category] = [];
        acc[category].push(s);
        return acc;
      }, {} as Record<string, typeof scenarios>);

      for (const [category, items] of Object.entries(grouped)) {
        console.log(chalk.cyan(`  ${category}`));
        for (const s of items) {
          const riskColor = s.riskLevel === 'safe' ? chalk.green
            : s.riskLevel === 'low' ? chalk.yellow
            : s.riskLevel === 'medium' ? chalk.red
            : chalk.red.bold;
          console.log(chalk.dim(`    ${s.id.padEnd(25)} ${chalk.white(s.name.padEnd(25))} Risk: ${riskColor(s.riskLevel.padEnd(6))}`));
        }
        console.log();
      }

      console.log(chalk.dim(`  Total: ${scenarios.length} scenarios\n`));
      console.log(chalk.dim('  Usage:'));
      console.log(chalk.dim('    turpan review . --scenarios auth,billing     Run specific scenarios'));
      console.log(chalk.dim('    turpan review . --ui                         Run all supported scenarios'));
      console.log(chalk.dim('    turpan scenarios list                         Show all scenarios\n'));
    });

  cmd.addCommand(listCmd);

  // ── scenarios inspect ───────────────────────────────────────────────────────
  const inspectCmd = new Command('inspect');
  inspectCmd
    .description('Show details about a specific scenario')
    .argument('<scenario-id>', 'Scenario ID (e.g. auth, billing, saas-marketing)')
    .action(async (scenarioId: string) => {
      const scenario = scenarioRegistry.get(scenarioId);

      if (!scenario) {
        console.error(chalk.red(`\nScenario "${scenarioId}" not found.\n`));
        console.log(chalk.dim('Run `turpan scenarios list` to see available scenarios.\n'));
        process.exit(1);
      }

      console.log(chalk.bold(`\n🎭 Scenario: ${scenario.name}\n`));
      console.log(chalk.cyan('  ID:         ') + scenario.id);
      console.log(chalk.cyan('  Name:       ') + scenario.name);
      console.log(chalk.cyan('  Risk Level: ') + scenario.riskLevel);
      console.log();
      console.log(chalk.cyan('  Supports:'));
      console.log(chalk.dim('    Call with a ProjectFingerprint to determine applicability.\n'));
    });

  cmd.addCommand(inspectCmd);

  // ── scenarios test-auth (Phase 27) ───────────────────────────────────────
  const testAuthCmd = new Command('test-auth');
  testAuthCmd
    .description('Show authenticated SaaS test status and configuration')
    .option('--project <path>', 'Project path', '.')
    .option('--json', 'Output as JSON', false)
    .action(async (options: { project?: string; json?: boolean }) => {
      const { resolveProjectPath, loadConfig } = await import('@turpan/shared');
      const { loadConfig: loadCoreConfig } = await import('@turpan/core');
      const projectPath = resolveProjectPath(options.project ?? '.');

      // Try shared first, fall back to core (Phase 1 inconsistency)
      let cfg: Record<string, unknown> | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cfg = loadCoreConfig(projectPath) as any;
      } catch {
        // ignore
      }

      const ui = cfg?.['ui'] as Record<string, unknown> | undefined;
      const testUser = ui?.['testUser'] as Record<string, unknown> | undefined;
      const billing = ui?.['billing'] as Record<string, unknown> | undefined;

      const report = {
        projectPath,
        testUser: {
          configured: !!testUser,
          enabled: testUser?.['enabled'] === true,
          email: testUser?.['email'] ?? null,
          loginPath: testUser?.['loginPath'] ?? null,
          dashboardPath: testUser?.['dashboardPath'] ?? null,
          seedCommand: testUser?.['seedCommand'] ? '<set>' : null,
          // SAFETY: NEVER include password
          passwordStored: false,
        },
        billing: {
          configured: !!billing,
          testMode: billing?.['testMode'] === true,
          checkoutEndpoint: billing?.['checkoutEndpoint'] ?? null,
        },
        scenarios: scenarioRegistry.list()
          .filter(s => s.id.startsWith('next-saas-'))
          .map(s => ({ id: s.id, name: s.name, riskLevel: s.riskLevel })),
      };

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(chalk.bold('\n🔐 Turpan Authenticated SaaS Test Status\n'));
      console.log(chalk.cyan('  Project:'), projectPath);

      const testUserMode = report.testUser.enabled ? chalk.green('ENABLED') : chalk.yellow('DRY-RUN (default)');
      console.log(chalk.cyan('  testUser:'), testUserMode);
      if (report.testUser.configured) {
        console.log(chalk.dim(`    email:          ${report.testUser.email ?? '(unset)'}`));
        console.log(chalk.dim(`    loginPath:      ${report.testUser.loginPath ?? '/login'}`));
        console.log(chalk.dim(`    dashboardPath:  ${report.testUser.dashboardPath ?? '/dashboard'}`));
        console.log(chalk.dim(`    seedCommand:    ${report.testUser.seedCommand ?? '(none)'}`));
        console.log(chalk.dim(`    passwordStored: false (NEVER persisted)`));
      } else {
        console.log(chalk.dim(`    (no ui.testUser section in turpan.yml)`));
      }
      console.log();

      const billingMode = report.billing.testMode ? chalk.green('ENABLED') : chalk.yellow('DISABLED (default)');
      console.log(chalk.cyan('  billing:'), billingMode);
      if (report.billing.configured) {
        console.log(chalk.dim(`    checkoutEndpoint: ${report.billing.checkoutEndpoint ?? '/api/test-checkout (auto-detect)'}`));
      } else {
        console.log(chalk.dim(`    (no ui.billing section in turpan.yml)`));
      }
      console.log();

      console.log(chalk.cyan('  Authenticated scenarios:'));
      for (const s of report.scenarios) {
        const riskColor = s.riskLevel === 'safe' ? chalk.green
          : s.riskLevel === 'low' ? chalk.yellow
          : chalk.red;
        console.log(chalk.dim(`    ${s.id.padEnd(45)} Risk: ${riskColor(s.riskLevel)}`));
      }
      console.log();

      if (!report.testUser.enabled) {
        console.log(chalk.yellow('  To enable real authenticated scenario runs:'));
        console.log(chalk.dim('    1. Set ui.testUser.enabled: true in turpan.yml'));
        console.log(chalk.dim('    2. Provide a TEST account (NEVER real user credentials)'));
        console.log(chalk.dim('    3. Optionally provide a seedCommand to prepare the test user'));
        console.log();
        console.log(chalk.dim('  See docs/UI_TESTING.md for full configuration and safety properties.'));
        console.log();
      } else {
        console.log(chalk.green('  ✓ Authenticated scenarios will run with REAL submission'));
        console.log(chalk.dim('    Run: turpan ui-test ' + projectPath + ' --scenarios next-saas-auth-good'));
        console.log();
      }
    });

  cmd.addCommand(testAuthCmd);

  return cmd;
}
