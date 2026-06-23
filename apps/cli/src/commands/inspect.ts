import { Command } from 'commander';
import chalk from 'chalk';
import { detectProject, formatFingerprintSummary, type ProjectFingerprint } from '@turpan/core';
import { resolveProjectPath } from '@turpan/shared';

export function createInspectCommand(): Command {
  const cmd = new Command('inspect');
  cmd
    .description('Inspect and display project fingerprint without running analysis')
    .argument('[path]', 'Project path to inspect', '.')
    .option('--json', 'Output as JSON', false)
    .action(async (path: string, options: { json?: boolean }) => {
      const projectPath = resolveProjectPath(path);

      console.log(chalk.bold('\n🔍 Project Fingerprint\n'));
      console.log(chalk.dim(`Inspecting: ${projectPath}\n`));

      try {
        const fingerprint = detectProject(projectPath);

        if (options.json) {
          // Output full JSON (but redact any secrets)
          console.log(JSON.stringify(fingerprint, null, 2));
        } else {
          // Human-readable summary
          console.log(chalk.bold('📋 Project Summary'));
          console.log(chalk.dim('─'.repeat(50)));

          printFingerprintSummary(fingerprint);

          console.log(chalk.dim('─'.repeat(50) + '\n'));

          // Show missing important items
          if (fingerprint.missingFiles.length > 0) {
            console.log(chalk.bold('⚠️  Missing / Potential Issues'));
            for (const missing of fingerprint.missingFiles) {
              console.log(`  ${chalk.yellow('•')} ${missing}`);
            }
            console.log();
          }
        }

        // Save fingerprint to .turpan/runs/latest/project-fingerprint.json
        await saveFingerprint(projectPath, fingerprint);
      } catch (error) {
        console.error(chalk.red(`\n❌ Inspection failed: ${error}\n`));
        process.exit(1);
      }
    });

  return cmd;
}

function printFingerprintSummary(fp: ProjectFingerprint): void {
  // Basic info
  console.log(`  ${chalk.cyan('Project:')} ${fp.projectName}`);
  console.log(`  ${chalk.cyan('Type:')} ${fp.appType}`);

  // Repository
  if (fp.repositoryStatus.isGitRepo) {
    console.log(`  ${chalk.cyan('Git:')} ${fp.repositoryStatus.branch} @ ${fp.repositoryStatus.commitHash}${fp.repositoryStatus.isDirty ? chalk.yellow(' (dirty)') : ''}`);
  } else {
    console.log(`  ${chalk.cyan('Git:')} ${chalk.dim('not a git repository')}`);
  }

  // Languages & Package Manager
  console.log(`  ${chalk.cyan('Languages:')} ${fp.languages.join(', ')}`);
  if (fp.packageManager !== 'unknown') {
    console.log(`  ${chalk.cyan('Package Manager:')} ${fp.packageManager}${fp.lockFile ? ` (${fp.lockFile})` : ''}`);
  }

  // Frameworks
  if (fp.uiFramework !== 'unknown' && fp.uiFramework !== 'none') {
    console.log(`  ${chalk.cyan('UI Framework:')} ${fp.uiFramework}`);
  }
  if (fp.backendFramework !== 'unknown' && fp.backendFramework !== 'none') {
    console.log(`  ${chalk.cyan('Backend Framework:')} ${fp.backendFramework}`);
  }

  // Scripts
  const scriptParts: string[] = [];
  if (fp.buildCommands.length > 0) scriptParts.push(`build: ${fp.buildCommands.join(', ')}`);
  if (fp.devCommands.length > 0) scriptParts.push(`dev: ${fp.devCommands.join(', ')}`);
  if (fp.testCommands.length > 0) scriptParts.push(`test: ${fp.testCommands.join(', ')}`);
  if (fp.lintCommands.length > 0) scriptParts.push(`lint: ${fp.lintCommands.join(', ')}`);
  if (fp.typecheckCommands.length > 0) scriptParts.push(`typecheck: ${fp.typecheckCommands.join(', ')}`);
  if (scriptParts.length > 0) {
    console.log(`  ${chalk.cyan('Scripts:')} ${scriptParts.join(' | ')}`);
  } else {
    console.log(`  ${chalk.cyan('Scripts:')} ${chalk.yellow('none detected')}`);
  }

  // Test tools
  if (fp.testTools.length > 0 && fp.testTools[0] !== 'unknown') {
    console.log(`  ${chalk.cyan('Test Tools:')} ${fp.testTools.join(', ')}`);
  } else {
    console.log(`  ${chalk.cyan('Test Tools:')} ${chalk.yellow('none detected')}`);
  }

  // Docker
  if (fp.dockerAvailable) {
    console.log(`  ${chalk.cyan('Docker:')} available`);
  }
  if (fp.dockerComposeAvailable) {
    console.log(`  ${chalk.cyan('Docker Compose:')} available`);
  }

  // Database
  if (fp.databaseHints.length > 0) {
    const dbTypes = fp.databaseHints.map(d => d.type).join(', ');
    console.log(`  ${chalk.cyan('Database:')} ${dbTypes}`);
  }

  // Auth
  if (fp.authHints.length > 0) {
    const authTypes = fp.authHints.flatMap(a => a.type).join(', ');
    console.log(`  ${chalk.cyan('Auth:')} ${authTypes}`);
  }

  // Env files (without showing secrets)
  if (fp.envFiles.length > 0) {
    console.log(`  ${chalk.cyan('Env Files:')} ${fp.envFiles.join(', ')}`);
    if (fp.envRequirements.some(e => e.isSecret)) {
      console.log(`  ${chalk.dim('  (contains secret values - not displayed)')}`);
    }
  }

  // Entrypoints
  if (fp.entrypoints.length > 0) {
    const entryNames = fp.entrypoints.map(e => `${e.name} (${e.path})`).join(', ');
    console.log(`  ${chalk.cyan('Entrypoints:')} ${entryNames}`);
  }

  // Routes
  if (fp.routeHints.length > 0) {
    for (const route of fp.routeHints) {
      const typeStr = route.type === 'app' ? 'App Router' : route.type === 'pages' ? 'Pages Router' : 'Routes';
      console.log(`  ${chalk.cyan('Routes:')} ${route.count} ${typeStr} routes`);
      if (route.sampleRoutes && route.sampleRoutes.length > 0) {
        console.log(`    ${chalk.dim('Samples:')} ${route.sampleRoutes.join(', ')}`);
      }
    }
  }

  // Deployment platform
  if (fp.deploymentHints.platform) {
    console.log(`  ${chalk.cyan('Deploy Platform:')} ${fp.deploymentHints.platform}`);
  }

  console.log();
}

async function saveFingerprint(projectPath: string, fingerprint: ProjectFingerprint): Promise<void> {
  try {
    const { ensureDir } = await import('@turpan/shared');
    const { join } = await import('path');
    const { writeFileSync, existsSync, symlinkSync, unlinkSync } = await import('fs');

    const baseRunPath = join(projectPath, '.turpan', 'runs');
    const latestPath = join(baseRunPath, 'latest');
    const fingerprintPath = join(latestPath, 'project-fingerprint.json');

    // Ensure directory exists
    ensureDir(latestPath);

    // Write fingerprint
    writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2), 'utf-8');

    console.log(chalk.dim(`Fingerprint saved to: ${fingerprintPath}\n`));
  } catch {
    // Silently fail - fingerprinting should not block on save errors
  }
}
