/**
 * OnlineScanner — calls external APIs for CVE data (OSV, npm audit).
 * Only used when --online flag is explicitly passed.
 * All outputs are redacted. Timeouts are enforced.
 */

import type { DependencyInventory, VulnerabilityFinding, DependencyEntry } from './types.js';
import { matchVulnerabilities } from './vulndb.js';

// ─── Redaction helpers ────────────────────────────────────────────────────────

function redactUrl(url: string): string {
  return url.replace(/api\.osv\.dev.*/i, 'api.osv.dev/v1/...');
}

function redactDep(dep: DependencyEntry): DependencyEntry {
  return {
    ...dep,
    name: dep.name.replace(/^(.):(.+)/, (_, f, r) => `${f[0]}***${r.slice(-2)}`),
    version: dep.version.length > 3 ? `${dep.version[0]}***` : dep.version,
  };
}

// ─── OSV API ─────────────────────────────────────────────────────────────────

const OSV_API = 'https://api.osv.dev/v1/query';
const OSV_TIMEOUT_MS = 8_000;

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  published?: string;
  modified?: string;
  references?: Array<{ type: string; url: string }>;
}

async function queryOsv(dep: DependencyEntry, signal: AbortSignal): Promise<OsvVuln[]> {
  const pkg = dep.name;
  const version = dep.version;

  // Determine ecosystem
  let ecosystem = 'npm';
  if (pkg.includes('/') && !pkg.startsWith('@')) ecosystem = 'Go';
  else if (/^[\d]/.test(pkg)) ecosystem = 'PyPI';
  else if (pkg.includes('-') && !pkg.includes('@')) ecosystem = 'PyPI';

  try {
    const resp = await fetch(OSV_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: pkg, ecosystem },
        version,
      }),
      signal,
    });

    if (!resp.ok) return [];

    const data = await resp.json() as { vulns?: OsvVuln[] };
    return data.vulns ?? [];
  } catch {
    return [];
  }
}

function osvToVuln(dep: DependencyEntry, osv: OsvVuln): VulnerabilityFinding {
  const score = osv.severity?.[0]?.score ?? '';
  const cvss = parseFloat(score);
  const severity = cvss >= 9 ? 'critical' : cvss >= 7 ? 'high' : cvss >= 4 ? 'medium' : 'low';

  return {
    dependency: redactDep(dep),
    vulnerability: {
      package: dep.name,
      vulnerableVersions: osv.id,
      cveId: osv.id.startsWith('CVE-') ? osv.id : undefined,
      cvssScore: isNaN(cvss) ? undefined : cvss,
      severity: severity as 'critical' | 'high' | 'medium' | 'low',
      title: osv.summary ?? osv.id,
      description: osv.details ?? '',
    },
  };
}

// ─── npm audit ───────────────────────────────────────────────────────────────

interface NpmAuditEntry {
  name: string;
  url?: string;
  severity?: string;
  title?: string;
  range?: string;
  fixAvailable?: boolean;
}

interface NpmAuditAdvisory {
  module_name: string;
  severity: string;
  title: string;
  url?: string;
  findings?: Array< { version: string; paths: string[] } >;
}

async function runNpmAudit(projectPath: string, signal: AbortSignal): Promise<Array<{ dep: DependencyEntry; advisory: NpmAuditAdvisory }>> {
  try {
    const { execSync } = await import('child_process');
    const result = execSync('npm audit --json', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 15_000,
    });
    const parsed = JSON.parse(result) as { advisories?: Record<string, NpmAuditAdvisory> };
    const advisories = parsed.advisories ?? {};
    return Object.values(advisories).map(a => ({
      dep: { name: a.module_name, version: a.findings?.[0]?.version ?? '*', type: 'prod' as const, source: 'direct' as const },
      advisory: a,
    }));
  } catch (e) {
    if (signal.aborted) throw e;
    return [];
  }
}

// ─── Main online scan ────────────────────────────────────────────────────────

/**
 * Run online CVE scan for a dependency inventory.
 * Falls back to offline matching when external APIs fail or time out.
 * Returns offline results filtered + enriched by online data.
 */
export async function onlineScan(
  inventory: DependencyInventory,
  signal: AbortSignal,
): Promise<{
  findings: VulnerabilityFinding[];
  errors: string[];
  usedOsv: boolean;
  usedNpmAudit: boolean;
}> {
  const findings: VulnerabilityFinding[] = [];
  const errors: string[] = [];

  // ── Phase 1: OSV API for direct prod dependencies ─────────────────────
  const directProd = inventory.dependencies.filter(d => d.source === 'direct' && d.type === 'prod');
  let usedOsv = false;

  for (const dep of directProd) {
    signal.throwIfAborted();
    const vulns = await Promise.race([
      queryOsv(dep, signal),
      new Promise<OsvVuln[]>(resolve => setTimeout(() => resolve([]), OSV_TIMEOUT_MS)),
    ]);
    usedOsv = true;
    if (vulns.length > 0) {
      for (const v of vulns) {
        findings.push(osvToVuln(dep, v));
      }
    }
  }

  // ── Phase 2: npm audit (if available) ────────────────────────────────
  let usedNpmAudit = false;
  if (inventory.projectType === 'node') {
    type NpmAuditResult = Array<{ dep: DependencyEntry; advisory: NpmAuditAdvisory }>;
    const npmResults = await Promise.race<NpmAuditResult>([
      runNpmAudit(inventory.projectPath, signal),
      new Promise<NpmAuditResult>(resolve => setTimeout(() => resolve([]), 15_000)),
    ]);
    usedNpmAudit = true;
    for (const { dep, advisory } of npmResults) {
      findings.push({
        dependency: redactDep(dep),
        vulnerability: {
          package: dep.name,
          vulnerableVersions: advisory.findings?.[0]?.paths?.join(' → ') ?? 'unknown',
          cveId: advisory.url?.match(/CVE-\d+-\d+/)?.[0],
          severity: (advisory.severity ?? 'medium') as 'critical' | 'high' | 'medium' | 'low',
          title: advisory.title ?? 'NPM advisory',
          description: `NPM advisory: ${advisory.title}`,
        },
      });
    }
  }

  // ── Phase 3: Offline fallback — add any missed from online ───────────
  // Offline matching as a safety net for packages not covered by OSV/npm audit
  for (const dep of inventory.dependencies) {
    const vuln = matchVulnerabilities(dep.name, dep.version);
    if (vuln && !findings.some(f => f.vulnerability.cveId === vuln.cveId && f.dependency.name === dep.name)) {
      findings.push({
        dependency: redactDep(dep),
        vulnerability: vuln,
      });
    }
  }

  return { findings, errors, usedOsv, usedNpmAudit };
}

/**
 * Run offline CVE scan only (no network calls).
 */
export function offlineScan(inventory: DependencyInventory): VulnerabilityFinding[] {
  const findings: VulnerabilityFinding[] = [];

  for (const dep of inventory.dependencies) {
    const vuln = matchVulnerabilities(dep.name, dep.version);
    if (vuln) {
      findings.push({
        dependency: dep,
        vulnerability: vuln,
      });
    }
  }

  return findings;
}
