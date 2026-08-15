import { Command } from 'commander';
import chalk from 'chalk';
import { resolveProjectPath } from '@turpan/shared';
import { runDependencyAudit } from '@turpan/dependency-audit';
import { loadConfig } from '@turpan/core';
import type { DependencyAuditResult } from '@turpan/dependency-audit';

function severityColor(severity: string): typeof chalk.red {
  switch (severity) {
    case 'critical': return chalk.red.bold;
    case 'high': return chalk.red;
    case 'medium': return chalk.yellow;
    case 'low': return chalk.blue;
    default: return chalk.dim;
  }
}

function printInventory(result: DependencyAuditResult): void {
  console.log(chalk.bold('\n📦 Dependency Inventory\n'));
  console.log(
    chalk.dim(`  Project: ${result.inventory.projectName ?? 'unknown'} `) +
    chalk.dim(`(${result.inventory.projectType})`)
  );
  console.log(chalk.dim(`  Total dependencies: ${result.inventory.dependencies.length}`));

  const prod = result.inventory.dependencies.filter(d => d.type === 'prod').length;
  const dev = result.inventory.dependencies.filter(d => d.type === 'dev').length;
  const transitive = result.inventory.dependencies.filter(d => d.source === 'transitive').length;

  console.log();
  console.log(`  ${chalk.green('prod')}       ${chalk.bold(prod)}`);
  console.log(`  ${chalk.blue('dev')}        ${chalk.bold(dev)}`);
  console.log(`  ${chalk.dim('transitive')}  ${chalk.bold(transitive)}`);
}

function printVulnerabilities(result: DependencyAuditResult): void {
  if (result.vulnerabilities.length === 0) {
    console.log(chalk.green('\n✅ No known vulnerabilities found (offline scan)\n'));
    return;
  }

  console.log(chalk.bold('\n🚨 Vulnerabilities Found\n'));

  const bySev = {
    critical: result.vulnerabilities.filter(v => v.vulnerability.severity === 'critical'),
    high: result.vulnerabilities.filter(v => v.vulnerability.severity === 'high'),
    medium: result.vulnerabilities.filter(v => v.vulnerability.severity === 'medium'),
    low: result.vulnerabilities.filter(v => v.vulnerability.severity === 'low'),
  };

  for (const [sev, vulns] of Object.entries(bySev) as [string, typeof result.vulnerabilities][]) {
    if (vulns.length === 0) continue;
    const color = severityColor(sev);
    console.log(chalk.bold(`  ${sev.toUpperCase()} (${vulns.length})`));
    for (const v of vulns) {
      const tag = v.vulnerability.cveId ? `[${v.vulnerability.cveId}]` : '';
      const exploited = v.vulnerability.exploitedInWild ? chalk.red(' ⚠️ exploited in wild') : '';
      console.log(
        `    ${color('●')} ${chalk.bold(v.dependency.name)}@${v.dependency.version} ` +
        chalk.dim(`— ${v.vulnerability.title}${tag}${exploited}`)
      );
    }
    console.log();
  }
}

function printLicenseFindings(result: DependencyAuditResult): void {
  const violations = result.licenseFindings.filter(l => l.policyViolation);
  const warnings = result.licenseFindings.filter(l => !l.policyViolation && l.risk !== 'none');

  if (violations.length === 0 && warnings.length === 0) {
    console.log(chalk.green('  ✅ No license issues\n'));
    return;
  }

  if (violations.length > 0) {
    console.log(chalk.red.bold('\n⚠️  License Policy Violations\n'));
    for (const l of violations) {
      console.log(
        `  ${chalk.red('✗')} ${chalk.bold(l.dependency.name)} ` +
        chalk.dim(`${l.license ?? '(no license)'} — ${l.reason}`)
      );
    }
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow.bold('\n⚠️  License Warnings\n'));
    for (const l of warnings) {
      const icon = l.risk === 'high' ? chalk.red('⚠') : chalk.yellow('⚠');
      console.log(
        `  ${icon} ${chalk.bold(l.dependency.name)} ` +
        chalk.dim(`${l.license ?? '(no license)'} — ${l.reason}`)
      );
    }
  }
  console.log();
}

function printResult(result: DependencyAuditResult, verbose = false): void {
  printInventory(result);

  if (result.vulnerabilities.length > 0 || result.licenseFindings.some(l => l.policyViolation)) {
    printVulnerabilities(result);
    printLicenseFindings(result);
  } else if (result.mode === 'offline' || result.mode === 'online') {
    printVulnerabilities(result);
    printLicenseFindings(result);
  }

  // Summary line
  const vulnCount = result.vulnerabilities.length;
  const licCount = result.licenseFindings.filter(l => l.policyViolation).length;
  const mode = result.mode === 'online' ? 'online' : 'offline';

  if (vulnCount === 0 && licCount === 0) {
    console.log(
      chalk.green(`\n✅ Audit clean (${mode} mode, ${result.inventory.dependencies.length} deps scanned)\n`)
    );
  } else {
    console.log(
      chalk.red(`\n❌ Audit found ${vulnCount} vulnerabilities and ${licCount} license violations `) +
      chalk.dim(`(${mode} mode)\n`)
    );
  }

  if (verbose) {
    if (result.errors.length > 0) {
      console.log(chalk.yellow('\n  Errors:'));
      for (const e of result.errors) console.log(chalk.dim(`    ${e}`));
    }
  }
}

export function createDependencyAuditCommand(): Command {
  const cmd = new Command('dependency-audit');
  cmd
    .description('Scan project dependencies for vulnerabilities and license issues')
    .argument('[path]', 'Project path to audit', '.')
    .option('--online', 'Enable online CVE scanning via OSV/npm audit (explicit opt-in)', false)
    .option('--fail-on-critical', 'Exit with error code if critical vulnerabilities found', true)
    .option('--json', 'Output results as JSON', false)
    .action(async (path: string, options: { online?: boolean; failOnCritical?: boolean; json?: boolean }) => {
      const projectPath = resolveProjectPath(path);
      const config = loadConfig(projectPath);

      // Build dependencyAudit config from turpan.yml or defaults
      const auditConfig = {
        enabled: true,
        online: options.online ?? false,
        failOnCritical: options.failOnCritical ?? true,
        licensePolicy: {
          disallowed: [],
          warnUnknown: true,
        },
      };

      // Override from turpan.yml if present
      const yamlAudit = config.dependencyAudit;
      if (yamlAudit) {
        Object.assign(auditConfig, yamlAudit);
        // CLI flags override yaml
        if (options.online !== undefined) auditConfig.online = options.online;
        if (options.failOnCritical !== undefined) auditConfig.failOnCritical = options.failOnCritical;
      }

      console.log(chalk.bold('\n🔒 Turpan Dependency Audit\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim(`Mode: ${auditConfig.online ? chalk.yellow('ONLINE') : 'offline'}`));
      console.log(chalk.dim(`License policy: disallowed=${auditConfig.licensePolicy.disallowed.join(', ') || 'none'}`));
      console.log();

      try {
        // Generate a runId so SBOM files are written to .turpan/runs/<runId>/
        const runId = `dep-audit-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
        const result = await runDependencyAudit(projectPath, auditConfig, runId);

        if (options.json) {
          // Strip large SBOM from JSON output to keep it readable
          const jsonFriendly = {
            ...result,
            sbomCdx: undefined, // Keep JSON output compact
          };
          console.log(JSON.stringify(jsonFriendly, null, 2));
          return;
        }

        // Update the SBOM paths in the displayed message to use the actual runId
        console.log(chalk.dim(`  SBOM written to: .turpan/runs/${runId}/sbom.json`));
        console.log(chalk.dim(`  CycloneDX SBOM:  .turpan/runs/${runId}/sbom.cdx.json`));

        printResult(result, true);

        // Exit code logic
        const hasCritical = result.vulnerabilities.some(v => v.vulnerability.severity === 'critical');
        const hasLicViolation = result.licenseFindings.some(l => l.policyViolation);

        if (hasCritical && auditConfig.failOnCritical) {
          console.log(chalk.red('❌ Critical vulnerabilities found — failing as requested.\n'));
          process.exit(1);
        }
        if (hasLicViolation) {
          console.log(chalk.red('❌ License policy violations found.\n'));
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red(`\n❌ Audit failed: ${error}\n`));
        process.exit(1);
      }
    });

  return cmd;
}
