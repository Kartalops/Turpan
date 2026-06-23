/**
 * @turpan/dependency-audit — Dependency inventory, SBOM, CVE scanning, and license audit.
 *
 * Usage:
 *   import { runDependencyAudit } from '@turpan/dependency-audit';
 *
 *   const result = await runDependencyAudit('/path/to/project', {
 *     enabled: true,
 *     online: false,   // default: offline only
 *     failOnCritical: true,
 *     licensePolicy: { disallowed: ['GPL-3.0'], warnUnknown: true },
 *   });
 */

export * from './types.js';
export * from './inventory.js';
export * from './vulndb.js';
export * from './sbom.js';
export * from './license.js';
export * from './onlineScanner.js';

import { buildDependencyInventory } from './inventory.js';
import { offlineScan, onlineScan } from './onlineScanner.js';
import { auditLicenses } from './license.js';
import { buildSbom, buildCycloneDx } from './sbom.js';
import type { DependencyAuditConfig, DependencyAuditResult, DependencyInventory, VulnerabilityFinding } from './types.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Run the full dependency audit pipeline.
 *
 * @param projectPath  Path to the project to audit
 * @param config       Audit configuration (from turpan.yml or defaults)
 * @param runId       Optional run ID for SBOM output path
 * @param abortSignal  Optional AbortSignal for cancellation
 */
export async function runDependencyAudit(
  projectPath: string,
  config: Partial<DependencyAuditConfig> = {},
  runId?: string,
  abortSignal?: AbortSignal,
): Promise<DependencyAuditResult> {
  const fullConfig: DependencyAuditConfig = {
    enabled: config.enabled ?? false,
    online: config.online ?? false,
    failOnCritical: config.failOnCritical ?? true,
    licensePolicy: {
      disallowed: config.licensePolicy?.disallowed ?? [],
      warnUnknown: config.licensePolicy?.warnUnknown ?? true,
    },
  };

  const errors: string[] = [];

  // Step 1: Build inventory
  let inventory: DependencyInventory;
  try {
    inventory = buildDependencyInventory(projectPath);
  } catch (e) {
    errors.push(`Failed to build dependency inventory: ${e instanceof Error ? e.message : String(e)}`);
    inventory = {
      projectPath,
      projectType: 'unknown',
      dependencies: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Step 2: CVE scan
  let vulnerabilities: VulnerabilityFinding[] = [];
  let scanMode: 'offline' | 'online' = 'offline';

  if (!fullConfig.enabled) {
    vulnerabilities = [];
  } else if (fullConfig.online && !abortSignal?.aborted) {
    scanMode = 'online';
    const signal = abortSignal ?? new AbortController().signal;
    const result = await onlineScan(inventory, signal);
    vulnerabilities = result.findings;
    errors.push(...result.errors);
  } else {
    vulnerabilities = offlineScan(inventory);
  }

  // Step 3: SBOM — built after vuln scan so components can be annotated with vuln counts
  const sbom = buildSbom(inventory, vulnerabilities);
  const sbomCdx = buildCycloneDx(sbom);

  // Step 4: Write SBOM files if runId is provided
  if (runId) {
    const runDir = join(projectPath, '.turpan', 'runs', runId);
    try {
      mkdirSync(runDir, { recursive: true });
      writeFileSync(join(runDir, 'sbom.json'), JSON.stringify(sbom, null, 2), 'utf-8');
      writeFileSync(join(runDir, 'sbom.cdx.json'), sbomCdx, 'utf-8');
    } catch (e) {
      errors.push(`Failed to write SBOM files: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Step 5: License audit
  const licenseFindings = fullConfig.enabled
    ? auditLicenses(inventory, fullConfig)
    : [];

  return {
    inventory,
    vulnerabilities,
    licenseFindings,
    sbom,
    sbomCdx,
    mode: scanMode,
    errors,
  };
}
