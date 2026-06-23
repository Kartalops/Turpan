/**
 * SBOM Generator — produces internal SBOM and optional CycloneDX JSON.
 */

import type { DependencyInventory, Sbom, SbomComponent, DependencyEntry, VulnerabilityFinding } from './types.js';

function depToComponent(dep: DependencyEntry, vulnCount: number = 0): SbomComponent {
  const ecosystem: SbomComponent['ecosystem'] =
    dep.sourceFile?.endsWith('requirements.txt') || dep.sourceFile?.endsWith('pyproject.toml')
      ? 'pypi'
      : dep.sourceFile?.includes('package.json')
        ? 'npm'
        : 'unknown';
  return {
    name: dep.name,
    version: dep.version,
    ecosystem,
    type: 'library',
    licenses: dep.license ? [dep.license] : undefined,
    dependencyType: dep.type,
    source: dep.source,
    sourceFile: dep.sourceFile,
    vulnerabilities: vulnCount > 0 ? vulnCount : undefined,
  };
}

/**
 * Build the internal SBOM from a DependencyInventory.
 * @param inventory  The dependency inventory
 * @param vulnerabilities  Optional vulnerability findings to annotate components with vuln count
 */
export function buildSbom(inventory: DependencyInventory, vulnerabilities: VulnerabilityFinding[] = []): Sbom {
  // Build a map of package → vuln count for annotation
  const vulnCountByDep = new Map<string, number>();
  for (const vf of vulnerabilities) {
    const key = `${vf.dependency.name}@${vf.dependency.version}`;
    vulnCountByDep.set(key, (vulnCountByDep.get(key) ?? 0) + 1);
  }

  return {
    format: 'turpan-sbom',
    version: '1.0',
    projectName: inventory.projectName ?? 'unknown',
    projectVersion: inventory.projectVersion,
    projectEcosystem: inventory.projectType === 'node' ? 'npm' : inventory.projectType === 'python' ? 'pypi' : 'unknown',
    components: inventory.dependencies.map(dep => {
      const key = `${dep.name}@${dep.version}`;
      return depToComponent(dep, vulnCountByDep.get(key) ?? 0);
    }),
    generatedAt: new Date().toISOString(),
    generator: 'turpan-dependency-audit',
  };
}

/**
 * CycloneDX 1.4 JSON serialization.
 * https://cyclonedx.org/docs/1.4/json/
 */
export function buildCycloneDx(sbom: Sbom): string {
  const components = sbom.components.map(c => {
    const ecosystem = c.ecosystem ?? 'unknown';
    const scheme = ecosystem === 'pypi' ? 'pypi' : ecosystem === 'npm' ? 'npm' : 'unknown';
    const purl = scheme !== 'unknown'
      ? `pkg:${scheme}/${c.name}@${c.version}`
      : undefined;

    return {
      type: 'library',
      name: c.name,
      version: c.version,
      purl,
      licenses: c.licenses
        ? c.licenses.map(l => ({ license: { id: l } }))
        : [{ license: { id: 'NOASSERTION' } }],
    };
  });

  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    version: 1,
    metadata: {
      timestamp: sbom.generatedAt,
      tools: [{ name: sbom.generator }],
      component: {
        type: 'application',
        name: sbom.projectName,
        version: sbom.projectVersion,
      },
    },
    components,
  };

  return JSON.stringify(doc, null, 2);
}
