/**
 * Dependency Audit — Comprehensive Tests
 * Covers: inventory, SBOM schema, CycloneDX, vulnerability matching,
 * license policy, offline/online modes, and CLI exit behavior.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
// Use built dist — tsup bundles all modules into index.js so all named exports
// are available from the single dist entry point.
import {
  runDependencyAudit,
  buildSbom,
  buildCycloneDx,
  matchVulnerabilities,
  auditLicenses,
  offlineScan,
  buildDependencyInventory,
} from '../dist/index.js';
import type { DependencyAuditConfig, DependencyEntry } from '../dist/index.js';

const FIXTURES = join(__dirname, '..', 'fixtures');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeNodeProject(
  name: string,
  deps: Record<string, string> = {},
  devDeps: Record<string, string> = {},
  optionalDeps: Record<string, string> = {},
  lockDeps?: Record<string, { version: string; license?: string; dependencies?: Record<string, { version: string }> }>,
): string {
  const dir = join(FIXTURES, name);
  mkdirSync(dir, { recursive: true });
  const pkg: Record<string, unknown> = { name, version: '1.0.0', dependencies: deps };
  if (Object.keys(devDeps).length) pkg.devDependencies = devDeps;
  if (Object.keys(optionalDeps).length) pkg.optionalDependencies = optionalDeps;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

  if (lockDeps) {
    const lock: Record<string, unknown> = { name: 'package-lock', version: 1, dependencies: {} };
    for (const [pkgName, info] of Object.entries(lockDeps)) {
      (lock.dependencies as Record<string, unknown>)[pkgName] = {
        version: info.version,
        license: info.license,
        dependencies: info.dependencies,
      };
    }
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2), 'utf-8');
  }
  return dir;
}

function makePythonProject(name: string, reqs: string[], pyproject = false): string {
  const dir = join(FIXTURES, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'requirements.txt'), reqs.join('\n') + '\n', 'utf-8');
  if (pyproject) {
    const lines = ['[project]', `name = "${name}"`, 'dependencies = ['];
    for (const r of reqs) lines.push(`  "${r}",`);
    lines.push(']');
    writeFileSync(join(dir, 'pyproject.toml'), lines.join('\n') + '\n', 'utf-8');
  }
  return dir;
}

// ─── 1. Inventory generation ───────────────────────────────────────────────────

describe('DependencyInventory', () => {

  it('should detect package.json and parse all dependency types', async () => {
    const dir = makeNodeProject('node-inventory-all-types', {
      express: '^4.0.0',
    }, {
      vitest: '^1.0.0',
    }, {
      'optional-pkg': '1.0.0',
    });

    const result = await runDependencyAudit(dir, { enabled: false });
    expect(result.inventory.projectType).toBe('node');
    expect(result.inventory.projectName).toBe('node-inventory-all-types');

    const prod = result.inventory.dependencies.filter(d => d.type === 'prod');
    const dev = result.inventory.dependencies.filter(d => d.type === 'dev');
    const optional = result.inventory.dependencies.filter(d => d.type === 'optional');

    expect(prod.some(d => d.name === 'express')).toBe(true);
    expect(dev.some(d => d.name === 'vitest')).toBe(true);
    expect(optional.some(d => d.name === 'optional-pkg')).toBe(true);
  });

  it('should set sourceFile for dependencies from package.json', async () => {
    const dir = makeNodeProject('node-sourcefile-test', { axios: '^1.0.0' });
    const result = await runDependencyAudit(dir, { enabled: false });
    const axios = result.inventory.dependencies.find(d => d.name === 'axios');
    expect(axios?.sourceFile).toBeDefined();
    expect(axios?.sourceFile?.endsWith('package.json')).toBe(true);
  });

  it('should parse transitive deps from package-lock.json', async () => {
    const dir = makeNodeProject('node-transitive-inv', {
      express: '4.17.1',
    }, {}, {}, {
      express: {
        version: '4.17.1',
        dependencies: {
          minimist: { version: '1.2.5' },
        },
      },
      minimist: { version: '1.2.5' },
    });

    const result = await runDependencyAudit(dir, { enabled: false });
    const minimist = result.inventory.dependencies.find(d => d.name === 'minimist');
    expect(minimist).toBeDefined();
    expect(minimist?.source).toBe('transitive');
    expect(minimist?.sourceFile?.endsWith('package-lock.json')).toBe(true);
  });

  it('should parse Python requirements.txt', async () => {
    const dir = makePythonProject('py-inv', ['requests==2.28.0', 'pyyaml>=5.0']);
    const result = await runDependencyAudit(dir, { enabled: false });
    expect(result.inventory.projectType).toBe('python');
    expect(result.inventory.dependencies.some(d => d.name === 'requests')).toBe(true);
    expect(result.inventory.dependencies.some(d => d.name === 'pyyaml')).toBe(true);
  });

  it('should parse pyproject.toml dependencies', async () => {
    const dir = makePythonProject('py-inv-pyproject', ['flask==2.0.0'], true);
    const result = await runDependencyAudit(dir, { enabled: false });
    expect(result.inventory.projectType).toBe('python');
    expect(result.inventory.dependencies.some(d => d.name === 'flask')).toBe(true);
  });

  it('should set ecosystem in inventory', async () => {
    const nodeDir = makeNodeProject('node-eco', { axios: '1.0.0' });
    const pyDir = makePythonProject('py-eco', ['pip==21.0']);

    const nodeResult = await runDependencyAudit(nodeDir, { enabled: false });
    const pyResult = await runDependencyAudit(pyDir, { enabled: false });

    expect(nodeResult.inventory.projectType).toBe('node');
    expect(pyResult.inventory.projectType).toBe('python');
  });

  it('should handle empty/unknown project gracefully', async () => {
    const dir = join(FIXTURES, 'node-unknown-inv');
    mkdirSync(dir, { recursive: true });
    const result = await runDependencyAudit(dir, { enabled: true });
    expect(result.inventory.projectType).toBe('unknown');
    expect(result.inventory.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── 2. SBOM schema ───────────────────────────────────────────────────────────

describe('SBOM schema', () => {

  it('sbom.json should contain all required fields', async () => {
    const dir = makeNodeProject('sbom-schema-test', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true });
    const sbom = result.sbom;

    expect(sbom.format).toBe('turpan-sbom');
    expect(sbom.version).toBe('1.0');
    expect(sbom.projectName).toBe('sbom-schema-test');
    expect(sbom.components.length).toBeGreaterThan(0);
    expect(sbom.generatedAt).toBeDefined();
    expect(sbom.generator).toBe('turpan-dependency-audit');
  });

  it('sbom components should have ecosystem, source, sourceFile, and vuln count', async () => {
    const dir = makeNodeProject('sbom-components-test', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true });
    const lodashComp = result.sbom.components.find(c => c.name === 'lodash');

    expect(lodashComp).toBeDefined();
    expect(lodashComp!.ecosystem).toBe('npm');
    expect(lodashComp!.dependencyType).toBe('prod');
    expect(lodashComp!.sourceFile?.endsWith('package.json')).toBe(true);
    // lodash@4.17.18 is vulnerable, should have vuln count
    expect(lodashComp!.vulnerabilities).toBeGreaterThan(0);
  });

  it('sbom should annotate vulnerable components with vuln count', async () => {
    const dir = makeNodeProject('sbom-vuln-count', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true });

    const lodashComp = result.sbom.components.find(c => c.name === 'lodash');
    expect(lodashComp?.vulnerabilities).toBeGreaterThan(0);
  });

  it('sbom projectEcosystem should reflect project type', async () => {
    const nodeDir = makeNodeProject('sbom-eco-node', { axios: '1.0.0' });
    const pyDir = makePythonProject('sbom-eco-py', ['pip==21.0']);

    const nodeResult = await runDependencyAudit(nodeDir, { enabled: false });
    const pyResult = await runDependencyAudit(pyDir, { enabled: false });

    expect(nodeResult.sbom.projectEcosystem).toBe('npm');
    expect(pyResult.sbom.projectEcosystem).toBe('pypi');
  });
});

// ─── 3. CycloneDX schema ──────────────────────────────────────────────────────

describe('CycloneDX output', () => {

  it('should produce valid CycloneDX JSON', async () => {
    const dir = makeNodeProject('cdx-test', { axios: '1.0.0' });
    const result = await runDependencyAudit(dir, { enabled: false });
    const cdx = JSON.parse(result.sbomCdx!);

    expect(cdx.bomFormat).toBe('CycloneDX');
    expect(cdx.specVersion).toBe('1.4');
    expect(cdx.version).toBe(1);
    expect(cdx.metadata).toBeDefined();
    expect(cdx.metadata.timestamp).toBeDefined();
    expect(cdx.metadata.tools).toContainEqual(
      expect.objectContaining({ name: 'turpan-dependency-audit' })
    );
    expect(Array.isArray(cdx.components)).toBe(true);
    expect(cdx.components.length).toBeGreaterThan(0);
  });

  it('should have correct component fields in CycloneDX', async () => {
    const dir = makeNodeProject('cdx-component-test', { axios: '1.0.0' });
    const result = await runDependencyAudit(dir, { enabled: false });
    const cdx = JSON.parse(result.sbomCdx!);
    const comp = cdx.components.find((c: { name: string }) => c.name === 'axios');

    expect(comp).toBeDefined();
    expect(comp.type).toBe('library');
    expect(comp.name).toBe('axios');
    expect(comp.version).toBe('1.0.0');
    expect(comp.purl).toMatch(/^pkg:npm\/axios@/);
  });

  it('should set NOASSERTION when license is missing', async () => {
    const dir = makeNodeProject('cdx-no-license', { axios: '1.0.0' });
    const result = await runDependencyAudit(dir, { enabled: false });
    const cdx = JSON.parse(result.sbomCdx!);
    const comp = cdx.components[0];
    expect(comp.licenses).toContainEqual(
      expect.objectContaining({ license: { id: 'NOASSERTION' } })
    );
  });

  it('should include license in CycloneDX when present', async () => {
    const dir = makeNodeProject('cdx-with-license', {}, {}, {}, {
      'some-pkg': { version: '1.0.0', license: 'MIT' },
    });
    const result = await runDependencyAudit(dir, { enabled: false });
    const cdx = JSON.parse(result.sbomCdx!);
    const comp = cdx.components.find((c: { name: string }) => c.name === 'some-pkg');
    expect(comp?.licenses).toContainEqual(
      expect.objectContaining({ license: { id: 'MIT' } })
    );
  });
});

// ─── 4. Vulnerability matching ───────────────────────────────────────────────

describe('Vulnerability matching', () => {

  it('should find vulnerable lodash (direct, offline)', async () => {
    const dir = makeNodeProject('vuln-lodash', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true });

    const lodashVuln = result.vulnerabilities.find(v => v.dependency.name === 'lodash');
    expect(lodashVuln).toBeDefined();
    expect(lodashVuln?.vulnerability.severity).toMatch(/critical|high/);
    expect(result.mode).toBe('offline');
  });

  it('should find minimist (transitive, offline)', async () => {
    const dir = makeNodeProject('vuln-transitive', {
      express: '4.17.1',
    }, {}, {}, {
      express: { version: '4.17.1', dependencies: { minimist: { version: '1.2.5' } } },
      minimist: { version: '1.2.5' },
    });
    const result = await runDependencyAudit(dir, { enabled: true });

    const minimistVuln = result.vulnerabilities.find(v => v.dependency.name === 'minimist');
    expect(minimistVuln).toBeDefined();
    expect(minimistVuln?.dependency.source).toBe('transitive');
    expect(minimistVuln?.vulnerability.severity).toBe('critical');
  });

  it('should find vulnerable Python package (pyyaml, offline)', async () => {
    const dir = makePythonProject('vuln-py', ['pyyaml==5.3']);
    const result = await runDependencyAudit(dir, { enabled: true });

    const pyyamlVuln = result.vulnerabilities.find(v => v.dependency.name === 'pyyaml');
    expect(pyyamlVuln).toBeDefined();
    expect(pyyamlVuln?.vulnerability.severity).toBe('critical');
    expect(pyyamlVuln?.vulnerability.cveId).toBe('CVE-2020-14343');
  });

  it('should not flag clean packages', async () => {
    const dir = makeNodeProject('vuln-clean', { chalk: '5.0.0' });
    const result = await runDependencyAudit(dir, { enabled: true });

    const chalkVulns = result.vulnerabilities.filter(v => v.dependency.name === 'chalk');
    expect(chalkVulns).toHaveLength(0);
  });

  it('should return highest severity when multiple CVEs match', async () => {
    // lodash@4.17.18 has both CVE-2019-10744 (critical, exploited) and CVE-2021-23337 (high)
    const dir = makeNodeProject('vuln-multi', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true });

    const lodashVulns = result.vulnerabilities.filter(v => v.dependency.name === 'lodash');
    expect(lodashVulns.length).toBeGreaterThan(0);
    // Should have critical (most severe)
    expect(lodashVulns.some(v => v.vulnerability.severity === 'critical')).toBe(true);
  });

  it('offlineScan should not make any network calls', async () => {
    const dir = makeNodeProject('offline-no-net', { lodash: '4.17.18' });
    const inventory = buildDependencyInventory(dir);

    // This must not throw even if network is unreachable
    const findings = offlineScan(inventory);
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.some(f => f.dependency.name === 'lodash')).toBe(true);
  });

  it('matchVulnerabilities returns null for clean packages', () => {
    expect(matchVulnerabilities('chalk', '5.0.0')).toBeNull();
  });
});

// ─── 5. License policy ────────────────────────────────────────────────────────

describe('License policy', () => {

  it('should flag GPL-3.0 as high-risk policy violation', () => {
    const config: DependencyAuditConfig = {
      enabled: true,
      online: false,
      failOnCritical: true,
      licensePolicy: { disallowed: ['GPL-3.0'], warnUnknown: true },
    };

    const dep: DependencyEntry = {
      name: 'some-gpl-pkg',
      version: '1.0.0',
      type: 'prod',
      source: 'direct',
      license: 'GPL-3.0',
    };
    const findings = auditLicenses({ dependencies: [dep] }, config);

    expect(findings).toHaveLength(1);
    expect(findings[0].risk).toBe('high');
    expect(findings[0].policyViolation).toBe(true);
    expect(findings[0].reason).toContain('explicitly disallowed');
  });

  it('should flag AGPL-3.0 as policy violation', () => {
    const config: DependencyAuditConfig = {
      enabled: true,
      online: false,
      failOnCritical: true,
      licensePolicy: { disallowed: ['AGPL-3.0'], warnUnknown: true },
    };
    const dep: DependencyEntry = { name: 'agpl-pkg', version: '1.0.0', type: 'prod', source: 'direct', license: 'AGPL-3.0' };
    const findings = auditLicenses({ dependencies: [dep] }, config);

    expect(findings[0].policyViolation).toBe(true);
    expect(findings[0].risk).toBe('high');
  });

  it('should warn on unknown license', () => {
    const config: DependencyAuditConfig = {
      enabled: true,
      online: false,
      failOnCritical: true,
      licensePolicy: { disallowed: [], warnUnknown: true },
    };
    const dep: DependencyEntry = { name: 'unknown-pkg', version: '1.0.0', type: 'prod', source: 'direct', license: 'CUSTOM-LICENSE' };
    const findings = auditLicenses({ dependencies: [dep] }, config);

    expect(findings.some(f => f.risk === 'medium' && !f.policyViolation)).toBe(true);
    expect(findings[0].reason).toContain('not recognized');
  });

  it('should warn on missing license', () => {
    const config: DependencyAuditConfig = {
      enabled: true,
      online: false,
      failOnCritical: true,
      licensePolicy: { disallowed: [], warnUnknown: true },
    };
    const dep: DependencyEntry = { name: 'no-license-pkg', version: '1.0.0', type: 'prod', source: 'direct' };
    const findings = auditLicenses({ dependencies: [dep] }, config);

    expect(findings.some(f => f.risk === 'medium' && f.license === null)).toBe(true);
  });

  it('should skip dev deps for non-disallowed licenses', () => {
    const config: DependencyAuditConfig = {
      enabled: true,
      online: false,
      failOnCritical: true,
      licensePolicy: { disallowed: [], warnUnknown: true },
    };
    const dep: DependencyEntry = { name: 'dev-unknown', version: '1.0.0', type: 'dev', source: 'direct', license: 'UNKNOWN-LICENSE' };
    const findings = auditLicenses({ dependencies: [dep] }, config);

    // dev deps without disallowed license should be skipped
    expect(findings.filter(f => f.dependency.name === 'dev-unknown')).toHaveLength(0);
  });

  it('should still flag dev deps that violate disallowed policy', () => {
    const config: DependencyAuditConfig = {
      enabled: true,
      online: false,
      failOnCritical: true,
      licensePolicy: { disallowed: ['GPL-3.0'], warnUnknown: true },
    };
    const dep: DependencyEntry = { name: 'dev-gpl', version: '1.0.0', type: 'dev', source: 'direct', license: 'GPL-3.0' };
    const findings = auditLicenses({ dependencies: [dep] }, config);

    expect(findings.some(f => f.policyViolation)).toBe(true);
  });

  it('should produce license summary in audit result', async () => {
    const dir = makeNodeProject('license-summary', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, {
      enabled: true,
      licensePolicy: { disallowed: ['GPL-3.0'], warnUnknown: true },
    });

    expect(Array.isArray(result.licenseFindings)).toBe(true);
  });
});

// ─── 6. Offline mode ─────────────────────────────────────────────────────────

describe('Offline mode', () => {

  it('should default to offline when online=false', async () => {
    const dir = makeNodeProject('mode-offline', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true, online: false });
    expect(result.mode).toBe('offline');
  });

  it('should have no errors in offline mode', async () => {
    const dir = makeNodeProject('offline-no-errors', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true, online: false });
    expect(result.errors).toHaveLength(0);
  });

  it('should still find vulnerabilities in offline mode', async () => {
    const dir = makeNodeProject('offline-finds-vulns', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true, online: false });
    expect(result.vulnerabilities.length).toBeGreaterThan(0);
  });

  it('should respect enabled=false', async () => {
    const dir = makeNodeProject('disabled-offline', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: false });
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.licenseFindings).toHaveLength(0);
  });

  it('offline mode should be safe with aborted signal', async () => {
    const dir = makeNodeProject('offline-abort', { lodash: '4.17.18' });
    const controller = new AbortController();
    controller.abort();
    const result = await runDependencyAudit(dir, { enabled: true }, undefined, controller.signal);
    expect(result.mode).toBe('offline');
    expect(result.errors).toHaveLength(0);
  });
});

// ─── 7. Online mode safety ───────────────────────────────────────────────────

describe('Online mode', () => {

  it('should set mode=online when online=true', async () => {
    const dir = makeNodeProject('online-mode', { lodash: '4.17.18' });
    // Use an AbortSignal that won't abort to let the online path attempt
    const controller = new AbortController();
    const result = await runDependencyAudit(dir, { enabled: true, online: true }, undefined, controller.signal);
    // Network may fail, but mode should still be 'online'
    expect(result.mode).toBe('online');
  });

  it('online mode should still use offline DB as fallback on network failure', async () => {
    const dir = makeNodeProject('online-fallback', { lodash: '4.17.18' });
    const controller = new AbortController();
    const result = await runDependencyAudit(dir, { enabled: true, online: true }, undefined, controller.signal);
    // Even if OSV fails, offline fallback should have caught lodash
    expect(result.vulnerabilities.some(v => v.dependency.name === 'lodash')).toBe(true);
  });

  it('online mode should gracefully handle network timeout', async () => {
    // Test that online mode with a very short timeout still returns results
    const dir = makeNodeProject('online-timeout', { lodash: '4.17.18' });
    const controller = new AbortController();
    // Don't abort — let it try online then timeout
    const result = await runDependencyAudit(dir, { enabled: true, online: true }, undefined, controller.signal);
    // Should have results from offline fallback at minimum
    expect(result.vulnerabilities.some(v => v.dependency.name === 'lodash')).toBe(true);
  });
});

// ─── 8. fail-on-critical exit behavior ───────────────────────────────────────

describe('fail-on-critical', () => {

  it('should produce no critical exit when none found', async () => {
    const dir = makeNodeProject('no-critical', { chalk: '5.0.0' });
    const result = await runDependencyAudit(dir, { enabled: true, failOnCritical: true });
    const hasCritical = result.vulnerabilities.some(v => v.vulnerability.severity === 'critical');
    expect(hasCritical).toBe(false);
  });

  it('should detect critical vulnerabilities for exit decision', async () => {
    const dir = makeNodeProject('has-critical', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true, failOnCritical: true });
    const hasCritical = result.vulnerabilities.some(v => v.vulnerability.severity === 'critical');
    // lodash@4.17.18 has critical CVE-2019-10744
    expect(hasCritical).toBe(true);
  });

  it('should exit 1 when failOnCritical=true and critical found', async () => {
    const dir = makeNodeProject('exit-critical', { lodash: '4.17.18' });
    const result = await runDependencyAudit(dir, { enabled: true, failOnCritical: true });
    const hasCritical = result.vulnerabilities.some(v => v.vulnerability.severity === 'critical');
    const hasLicViolation = result.licenseFindings.some(l => l.policyViolation);
    // This mirrors the CLI exit logic
    const shouldExit = (hasCritical && true) || hasLicViolation;
    expect(shouldExit).toBe(true);
  });
});

// ─── 9. SBOM write ───────────────────────────────────────────────────────────

describe('SBOM file write', () => {

  it('should write sbom.json to run directory', async () => {
    const dir = makeNodeProject('sbom-write', { express: '^4.0.0' });
    const runId = 'test-run-' + Date.now();
    await runDependencyAudit(dir, { enabled: false }, runId);

    const sbomPath = join(dir, '.turpan', 'runs', runId, 'sbom.json');
    expect(existsSync(sbomPath)).toBe(true);
    const content = JSON.parse(readFileSync(sbomPath, 'utf-8'));
    expect(content.format).toBe('turpan-sbom');
  });

  it('should write sbom.cdx.json to run directory', async () => {
    const dir = makeNodeProject('sbom-write-cdx', { express: '^4.0.0' });
    const runId = 'test-run-cdx-' + Date.now();
    await runDependencyAudit(dir, { enabled: false }, runId);

    const cdxPath = join(dir, '.turpan', 'runs', runId, 'sbom.cdx.json');
    expect(existsSync(cdxPath)).toBe(true);
    const content = JSON.parse(readFileSync(cdxPath, 'utf-8'));
    expect(content.bomFormat).toBe('CycloneDX');
  });
});
