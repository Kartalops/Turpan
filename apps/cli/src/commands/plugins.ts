/**
 * Plugin CLI commands:
 *  - turpan plugins list
 *  - turpan plugins inspect <id>
 *  - turpan plugins trust <id>
 *  - turpan plugins permissions <id>
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { PluginRegistry } from '@turpan/core';
import { loadPlugins } from '@turpan/core';
import { detectProject } from '@turpan/core';
import { PluginTrustDb } from '@turpan/core';
import {
  PLUGIN_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  DEFAULT_TRUSTED_PLUGINS,
  type PluginPermission,
  type PluginTrustLevel,
} from '@turpan/core';

function createPluginsCommand(): Command {
  const cmd = new Command('plugins');
  cmd.description('Plugin management commands');

  // ── plugins list ───────────────────────────────────────────────────────────
  const listCmd = new Command('list');
  listCmd
    .description('List available and loaded plugins')
    .option('--all', 'Show all plugins including not-loaded ones', false)
    .option('--json', 'Output as JSON', false)
    .action(async (options: { all?: boolean; json?: boolean }) => {
      const projectPath = process.cwd();
      const fingerprint = detectProject(projectPath);

      const registry = new PluginRegistry();
      const result = await loadPlugins(registry, {
        projectRoot: projectPath,
        fingerprint,
        enabledPlugins: options.all ? ['next', 'vite', 'python', 'saas', 'mcp', 'security-basic'] : undefined,
      });

      if (options.json) {
        console.log(JSON.stringify({
          loaded: result.loaded,
          skipped: result.skipped,
          errors: result.errors,
          summary: registry.toSummary(),
        }, null, 2));
        return;
      }

      console.log(chalk.bold('\n🧩 Turpan Plugins\n'));

      // Loaded
      console.log(chalk.green('✓ Loaded plugins:'));
      if (result.loaded.length === 0) {
        console.log(chalk.dim('  (none — run with --all to see all built-in plugins)\n'));
      } else {
        for (const id of result.loaded) {
          const plugin = registry.getPlugin(id);
          if (plugin) {
            console.log(`  ${chalk.cyan(id.padEnd(20))} ${chalk.dim('v' + plugin.manifest.version)}  ${plugin.manifest.description ?? ''}`);
          }
        }
        console.log();
      }

      // Skipped
      if (result.skipped.length > 0) {
        console.log(chalk.yellow('⚠ Skipped plugins:'));
        for (const s of result.skipped) {
          console.log(`  ${chalk.cyan(s.id.padEnd(20))} ${chalk.dim(s.reason)}`);
        }
        console.log();
      }

      // Errors
      if (result.errors.length > 0) {
        console.log(chalk.red('✗ Plugin errors:'));
        for (const e of result.errors) {
          console.log(`  ${chalk.cyan(e.id.padEnd(20))} ${chalk.red(e.error)}`);
        }
        console.log();
      }

      // Summary
      const summary = registry.toSummary();
      console.log(chalk.dim('─── Summary ───'));
      console.log(`  Analyzers:     ${chalk.cyan(summary.analyzerCount)}`);
      console.log(`  Rulesets:     ${chalk.cyan(summary.rulesetCount)}`);
      console.log(`  Report secs:  ${chalk.cyan(summary.reportSectionCount)}`);
      console.log(`  Scenarios:    ${chalk.cyan(summary.scenarioCount)}`);
      console.log(`  Detectors:    ${chalk.cyan(summary.detectorCount)}`);
      console.log(`  Fixers:       ${chalk.cyan(summary.fixerCount)}`);
      console.log(`  Commands:     ${chalk.cyan(summary.commandCount)}`);
      console.log(`  Extra stages: ${chalk.cyan(summary.stageIds.join(', ') || '(none)')}`);
      console.log();
    });

  // ── plugins inspect ─────────────────────────────────────────────────────────
  const inspectCmd = new Command('inspect');
  inspectCmd
    .description('Show detailed information about a specific plugin')
    .argument('<plugin-id>', 'Plugin ID to inspect (e.g. next, vite, python, saas, mcp, security-basic)')
    .option('--json', 'Output as JSON', false)
    .action(async (pluginId: string, options: { json?: boolean }) => {
      const projectPath = process.cwd();
      const fingerprint = detectProject(projectPath);

      const registry = new PluginRegistry();
      const result = await loadPlugins(registry, {
        projectRoot: projectPath,
        fingerprint,
        enabledPlugins: [pluginId],
      });

      const plugin = registry.getPlugin(pluginId);

      if (options.json) {
        if (plugin) {
          console.log(JSON.stringify({
            manifest: plugin.manifest,
            summary: registry.toSummary(),
            loaded: result.loaded,
            errors: result.errors,
          }, null, 2));
        } else {
          console.log(JSON.stringify({ error: `Plugin "${pluginId}" not found`, result }, null, 2));
        }
        return;
      }

      if (!plugin) {
        console.error(chalk.red(`\n✗ Plugin "${pluginId}" not found or not applicable to this project.\n`));
        const availableBuiltins = ['next', 'vite', 'python', 'saas', 'mcp', 'security-basic'];
        if (availableBuiltins.includes(pluginId)) {
          console.log(chalk.dim('  Hint: The plugin may not support this project type based on fingerprint.\n'));
        }
        console.log(chalk.dim('  Available built-in plugins: ' + availableBuiltins.join(', ') + '\n'));
        process.exit(1);
      }

      console.log(chalk.bold(`\n🧩 Plugin: ${pluginId}\n`));
      console.log(chalk.dim('─── Manifest ───'));
      console.log(`  Name:         ${chalk.cyan(plugin.manifest.name)}`);
      console.log(`  Version:      ${chalk.cyan(plugin.manifest.version)}`);
      console.log(`  ID:           ${chalk.cyan(plugin.manifest.id)}`);
      console.log(`  Description:  ${plugin.manifest.description ?? chalk.dim('(none)')}`);
      if (plugin.manifest.dependsOn?.length) {
        console.log(`  Depends on:   ${chalk.cyan(plugin.manifest.dependsOn.join(', '))}`);
      }

      // Contributed analyzers
      const analyzers = registry.listAnalyzers().filter(a => a.pluginId === pluginId);
      if (analyzers.length > 0) {
        console.log(chalk.dim('\n─── Analyzers ───'));
        for (const a of analyzers) {
          console.log(`  ${chalk.cyan(a.analyzer.id.padEnd(24))} ${a.analyzer.name}`);
          console.log(`    Categories: ${a.analyzer.categories.join(', ')}`);
        }
      }

      // Contributed rulesets
      const rulesets = registry.listRulesets().filter(r => r.pluginId === pluginId);
      if (rulesets.length > 0) {
        console.log(chalk.dim('\n─── Rulesets ───'));
        for (const r of rulesets) {
          console.log(`  ${chalk.cyan(r.ruleset.id.padEnd(24))} ${r.ruleset.label}`);
        }
      }

      // Contributed scenarios
      const scenarios = registry.listScenarios().filter(s => s.pluginId === pluginId);
      if (scenarios.length > 0) {
        console.log(chalk.dim('\n─── UI Scenarios ───'));
        for (const s of scenarios) {
          console.log(`  ${chalk.cyan(s.scenario.id.padEnd(24))} ${s.scenario.label}`);
          console.log(`    Category: ${s.scenario.category}`);
          console.log(`    Steps: ${s.scenario.steps.length}`);
        }
      }

      // Contributed commands
      const commands = registry.listCommands().filter(c => c.pluginId === pluginId);
      if (commands.length > 0) {
        console.log(chalk.dim('\n─── Commands ───'));
        for (const c of commands) {
          console.log(`  ${chalk.cyan(c.command.name.padEnd(24))} ${c.command.description ?? ''}`);
        }
      }

      console.log();
    });

  // ── plugins trust ───────────────────────────────────────────────────────────
  const trustCmd = new Command('trust');
  trustCmd
    .description('Trust or revoke an external plugin')
    .argument('<plugin-id>', 'Plugin ID to trust or revoke')
    .option('--level <level>', 'Trust level: builtin | local-trusted | external-untrusted', 'local-trusted')
    .option('--revoke', 'Remove this plugin from the trusted database', false)
    .option('--permissions <perms...', 'Comma-separated list of granted permissions')
    .option('--notes <notes>', 'Optional notes about this trust decision')
    .action(async (pluginId: string, options: {
      level?: string;
      revoke?: boolean;
      permissions?: string[];
      notes?: string;
    }) => {
      const projectPath = process.cwd();
      const trustDb = new PluginTrustDb(projectPath);

      if (options.revoke) {
        const success = trustDb.revokeTrust(pluginId);
        if (success) {
          console.log(chalk.green(`✓ Revoked trust for plugin "${pluginId}"`));
        } else {
          console.log(chalk.yellow(`⚠ Plugin "${pluginId}" was not in the trust database`));
        }
        return;
      }

      const level = options.level as PluginTrustLevel | undefined;
      if (level && !['builtin', 'local-trusted', 'external-untrusted'].includes(level)) {
        console.error(chalk.red(`Invalid trust level: "${level}". Use: builtin | local-trusted | external-untrusted`));
        process.exit(1);
      }

      // Built-in plugins cannot be re-trusted
      if (DEFAULT_TRUSTED_PLUGINS[pluginId] && !options.revoke) {
        console.log(chalk.yellow(`⚠ Plugin "${pluginId}" is a built-in plugin — trust is managed by @turpan/core`));
        console.log(chalk.dim(`  Trust level: ${DEFAULT_TRUSTED_PLUGINS[pluginId].trustLevel}`));
        console.log(chalk.dim(`  Granted permissions: ${DEFAULT_TRUSTED_PLUGINS[pluginId].grantedPermissions.join(', ')}`));
        return;
      }

      let permissions: PluginPermission[];
      if (options.permissions) {
        permissions = options.permissions as PluginPermission[];
        const invalid = permissions.filter(p => !PLUGIN_PERMISSIONS.includes(p as never));
        if (invalid.length > 0) {
          console.error(chalk.red(`Invalid permissions: ${invalid.join(', ')}`));
          console.error(chalk.dim(`Valid permissions: ${PLUGIN_PERMISSIONS.join(', ')}`));
          process.exit(1);
        }
      } else {
        // Default to local-trusted permissions
        permissions = ['read-package-metadata', 'run-analysis-only'];
        if (level === 'local-trusted') {
          permissions = ['read-project-files', 'read-package-metadata', 'run-analysis-only', 'propose-fixes', 'ui-scenarios', 'read-config'];
        }
      }

      const entry = trustDb.setTrust(
        pluginId,
        level ?? 'local-trusted',
        permissions,
        'cli',
        options.notes
      );

      console.log(chalk.green(`\n✓ Plugin "${pluginId}" is now trusted\n`));
      console.log(`  Trust level:   ${chalk.cyan(entry.trustLevel)}`);
      console.log(`  Permissions:   ${chalk.cyan(entry.grantedPermissions.join(', '))}`);
      console.log(`  Trusted since: ${chalk.dim(entry.trustedSince)}`);
      if (entry.notes) console.log(`  Notes:         ${chalk.dim(entry.notes)}`);
      console.log();
    });

  // ── plugins permissions ───────────────────────────────────────────────────────
  const permissionsCmd = new Command('permissions');
  permissionsCmd
    .description('Show available plugin permissions and their descriptions')
    .option('--json', 'Output as JSON', false)
    .action(async (options: { json?: boolean }) => {
      if (options.json) {
        const out = PLUGIN_PERMISSIONS.map(p => ({
          permission: p,
          description: PERMISSION_DESCRIPTIONS[p],
        }));
        console.log(JSON.stringify(out, null, 2));
        return;
      }

      console.log(chalk.bold('\n🔐 Plugin Permissions\n'));
      console.log(chalk.dim('Permissions a plugin can request in its manifest:\n'));
      for (const perm of PLUGIN_PERMISSIONS) {
        console.log(`  ${chalk.cyan(perm.padEnd(24))} ${PERMISSION_DESCRIPTIONS[perm]}`);
      }
      console.log();
    });

  cmd.addCommand(listCmd);
  cmd.addCommand(inspectCmd);
  cmd.addCommand(trustCmd);
  cmd.addCommand(permissionsCmd);

  return cmd;
}

export { createPluginsCommand };
