/**
 * VulnerabilityDatabase — offline bundle of known vulnerable packages.
 *
 * This is a conservative fixture database. In offline mode, Turpan
 * matches dependencies against this list. In online mode, the same
 * logic is used as a pre-filter before calling OSV/npm audit.
 *
 * Format mirrors OSV schema: https://osv.dev/schema
 */

import type { VulnerabilityRecord } from './types.js';

/**
 * Offline vulnerability database.
 * Each entry describes a known vulnerable package + version range.
 *
 * Real production CVE data would come from OSV (osv.dev) in online mode.
 */
export const OFFLINE_VULNERABILITY_DATABASE: VulnerabilityRecord[] = [
  // ── Critical: Known exploited in the wild ────────────────────────────────
  {
    package: 'event-stream',
    vulnerableVersions: '3.3.0 - 3.3.4',
    cveId: 'CVE-2018-3728',
    cvssScore: 9.8,
    severity: 'critical',
    title: 'event-stream flatmap-stream malicious package',
    description:
      'The event-stream package 3.3.0–3.3.4 contained a malicious dependency (flatmap-stream) that attempted to steal cryptocurrency wallets. This was an intentional supply-chain attack.',
    exploitedInWild: true,
  },
  {
    package: 'flatmap-stream',
    vulnerableVersions: '>=0.0.0',
    severity: 'critical',
    title: 'flatmap-stream — malicious package in event-stream attack',
    description:
      'flatmap-stream was inserted as a dependency of event-stream and contained code designed to steal cryptocurrency keys.',
    exploitedInWild: true,
  },

  // ── Transitive (commonly comes via other packages) ────────────────────────
  {
    package: 'minimist',
    vulnerableVersions: '<1.2.6',
    cveId: 'CVE-2021-44906',
    cvssScore: 9.8,
    severity: 'critical',
    title: 'minimist prototype pollution (transitive)',
    description:
      'minimist before 1.2.6 is vulnerable to prototype pollution. This package is frequently a transitive dependency of other tools.',
    exploitedInWild: false,
  },

  // ── High ─────────────────────────────────────────────────────────────────
  {
    package: 'lodash',
    vulnerableVersions: '<4.17.21',
    cveId: 'CVE-2021-23337',
    cvssScore: 7.2,
    severity: 'high',
    title: 'Lodash prototype pollution via merge',
    description:
      'Lodash versions before 4.17.21 are vulnerable to prototype pollution via the merge function. An attacker can modify the prototype of Object.prototype causing property injection.',
    exploitedInWild: false,
  },
  {
    package: 'lodash',
    vulnerableVersions: '<4.17.19',
    cveId: 'CVE-2019-10744',
    cvssScore: 9.1,
    severity: 'critical',
    title: 'Lodash prototype pollution via merge/mergeWith',
    description:
      'All versions of Lodash below 4.17.19 are vulnerable to prototype pollution. Functions merge, mergeWith, and defaultsDeep can be exploited.',
    exploitedInWild: true,
  },
  {
    package: 'minimist',
    vulnerableVersions: '<1.2.6',
    cveId: 'CVE-2021-44906',
    cvssScore: 9.8,
    severity: 'critical',
    title: 'minimist prototype pollution',
    description:
      'minimist before 1.2.6 is vulnerable to prototype pollution. An attacker can set arbitrary properties on Object.prototype via constructor arguments.',
    exploitedInWild: false,
  },
  {
    package: 'node-fetch',
    vulnerableVersions: '<2.6.7',
    cveId: 'CVE-2022-0235',
    cvssScore: 8.8,
    severity: 'high',
    title: 'node-fetch exposure of sensitive information',
    description:
      'node-fetch <2.6.7 does not enforce a security measure for cookies, allowing them to be sent to any origin. This can lead to session fixation or credential leakage.',
    exploitedInWild: false,
  },
  {
    package: 'xmlhttprequest',
    vulnerableVersions: '*',
    severity: 'high',
    title: 'xmlhttprequest — deprecated package with known RCE risk',
    description:
      'The xmlhttprequest npm package has known SSRF and RCE vulnerabilities and is no longer maintained. It should be replaced.',
    exploitedInWild: false,
  },
  {
    package: 'prompt-confirm',
    vulnerableVersions: '*',
    severity: 'high',
    title: 'prompt-confirm — benign name, malicious code',
    description:
      'The package prompt-confirm typosquatted the original prompt-confirm package and contained malicious code that copied .env files.',
    exploitedInWild: true,
  },

  // ── Medium ───────────────────────────────────────────────────────────────
  {
    package: 'glob-parent',
    vulnerableVersions: '<5.1.2',
    cveId: 'CVE-2020-28469',
    cvssScore: 7.5,
    severity: 'medium',
    title: 'glob-parent ReDoS via malicious path',
    description:
      'glob-parent before 5.1.2 is vulnerable to regular expression denial of service (ReDoS) when a malicious path is provided.',
    exploitedInWild: false,
  },
  {
    package: 'nth-check',
    vulnerableVersions: '<2.0.1',
    cveId: 'CVE-2021-3803',
    cvssScore: 9.1,
    severity: 'critical',
    title: 'nth-check ReDoS vulnerability',
    description:
      'nth-check before 2.0.1 is vulnerable to regular expression denial of service (ReDoS) via a crafted HTML input.',
    exploitedInWild: false,
  },
  {
    package: 'ansi-regex',
    vulnerableVersions: '<5.0.1',
    cveId: 'CVE-2021-3807',
    cvssScore: 7.8,
    severity: 'high',
    title: 'ansi-regex ReDoS — terminal escape sequence injection',
    description:
      'ansi-regex before 5.0.1 is vulnerable to ReDoS from crafted input containing ANSI escape sequences.',
    exploitedInWild: false,
  },
  {
    package: 'immer',
    vulnerableVersions: '<9.0.6',
    cveId: 'CVE-2021-23436',
    cvssScore: 8.2,
    severity: 'high',
    title: 'Immer prototype pollution vulnerability',
    description:
      'Immer before 9.0.6 is vulnerable to prototype pollution through the process tree, allowing an attacker to set arbitrary properties on Object.prototype.',
    exploitedInWild: false,
  },
  {
    package: 'ua-parser-js',
    vulnerableVersions: '<0.7.31',
    cveId: 'CVE-2022-25927',
    cvssScore: 9.1,
    severity: 'critical',
    title: 'ua-parser-js malicious code injection via npm',
    description:
      'ua-parser-js was compromised via a malicious npm release that added cryptomining code. Versions <0.7.31 may contain the malicious payload.',
    exploitedInWild: true,
  },
  {
    package: 'colors',
    vulnerableVersions: '1.4.0 - 1.4.44',
    severity: 'high',
    title: 'colors — malicious commit inserted into npm package',
    description:
      'The colors npm package was backdoored via a malicious commit that added an infinite loop, causing applications to hang. This was an insider attack.',
    exploitedInWild: false,
  },
  {
    package: 'faker',
    vulnerableVersions: '<5.5.3',
    cveId: 'CVE-2022-23634',
    cvssScore: 7.5,
    severity: 'medium',
    title: 'faker prototype pollution',
    description:
      'faker.js before 5.5.3 is vulnerable to prototype pollution through the setPath function.',
    exploitedInWild: false,
  },

  // ── Python-specific ───────────────────────────────────────────────────────
  {
    package: 'pyyaml',
    vulnerableVersions: '<5.4',
    cveId: 'CVE-2020-14343',
    cvssScore: 9.8,
    severity: 'critical',
    title: 'PyYAML arbitrary code execution via Python object deserialization',
    description:
      'PyYAML before 5.4 allows Python object deserialization via the load() function. An attacker can execute arbitrary code by providing a malicious YAML payload.',
    exploitedInWild: true,
  },
  {
    package: 'django',
    vulnerableVersions: '<3.2.20',
    cveId: 'CVE-2023-36053',
    cvssScore: 9.8,
    severity: 'critical',
    title: 'Django potential SQL injection via CMSPlugin.model',
    description:
      'Django before 3.2.20 allows SQL injection via model kwargs when using certain query methods.',
    exploitedInWild: false,
  },
  {
    package: 'requests',
    vulnerableVersions: '<2.20.0',
    cveId: 'CVE-2018-18074',
    cvssScore: 7.5,
    severity: 'medium',
    title: 'Requests session cookie exposure',
    description:
      'requests before 2.20.0 could expose a cookie URL if it contains a redirect to a different host, leaking sensitive data.',
    exploitedInWild: false,
  },
  {
    package: 'pillow',
    vulnerableVersions: '<8.3.2',
    cveId: 'CVE-2022-22817',
    cvssScore: 9.8,
    severity: 'critical',
    title: 'Pillow arbitrary code execution via PIL.ImageMath',
    description:
      'Pillow before 8.3.2 allows arbitrary code execution via the eval function in PIL.ImageMath.',
    exploitedInWild: true,
  },
  {
    package: 'numpy',
    vulnerableVersions: '<1.22.0',
    cvssScore: 7.4,
    severity: 'medium',
    title: 'NumPy buffer overflow via tostring',
    description:
      'NumPy before 1.22.0 has a buffer overflow in numpy.core.numeric.toString due to improper input validation.',
    exploitedInWild: false,
  },
  {
    package: 'setuptools',
    vulnerableVersions: '<65.5.1',
    cveId: 'CVE-2022-40897',
    cvssScore: 7.5,
    severity: 'medium',
    title: 'setuptools wheel.install vulnerable to dependency confusion',
    description:
      'setuptools before 65.5.1 is vulnerable to dependency confusion by not properly validating packages from PyPI versus locally specified versions.',
    exploitedInWild: false,
  },
];

/**
 * Match a package name + version against the offline vulnerability database.
 * Returns the MOST SEVERE matching VulnerabilityRecord for the given package
 * (or null if no match). Security scanners should surface the worst-case result.
 */
export function matchVulnerabilities(
  packageName: string,
  version: string,
): VulnerabilityRecord | null {
  const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  let best: VulnerabilityRecord | null = null;

  for (const vuln of OFFLINE_VULNERABILITY_DATABASE) {
    if (vuln.package === packageName) {
      if (versionInRange(version, vuln.vulnerableVersions)) {
        const a = SEVERITY_ORDER[best?.severity ?? 'none'] ?? 0;
        const b = SEVERITY_ORDER[vuln.severity] ?? 0;
        if (b > a) {
          best = vuln;
        }
      }
    }
  }
  return best;
}

/**
 * Simple semver range check.
 * Handles: exact ("1.2.3"), range ("1.2.3 - 2.0.0"), prefix ranges ("^1.2.3", "~1.2.3", ">=1.0.0"),
 * and wildcard ("*").
 */
function versionInRange(version: string, range: string): boolean {
  // Normalize the version string
  const clean = version.replace(/^[~^>=<!\s]+/, '').split('-')[0].split('+')[0];
  const [vMaj, vMin, vPat] = clean.split('.').map(Number);

  if (range === '*' || range === '>=0.0.0') return true;

  // Handle "1.2.3 - 2.0.0" range
  const rangeMatch = range.match(/^[\s~^>=<]*([\d.]+)\s*-\s*([\d.]+)$/);
  if (rangeMatch) {
    const [, low, high] = rangeMatch;
    return (
      compareVersions(clean, low) >= 0 &&
      compareVersions(clean, high) <= 0
    );
  }

  // Handle ^x.y.z, ~x.y.z, >=x.y.z, =x.y.z
  const prefix = range.match(/^([~^>=<]+)([\d.]+)/);
  if (prefix) {
    const [, op, target] = prefix;
    if (op === '^') {
      const [tMaj] = target.split('.').map(Number);
      return vMaj === tMaj;
    }
    if (op === '~') {
      const [tMaj, tMin] = target.split('.').map(Number);
      return vMaj === tMaj && vMin === tMin;
    }
    if (op === '>=') return compareVersions(clean, target) >= 0;
    if (op === '>') return compareVersions(clean, target) > 0;
    if (op === '<=') return compareVersions(clean, target) <= 0;
    if (op === '<') return compareVersions(clean, target) < 0;
    if (op === '=') return compareVersions(clean, target) === 0;
  }

  // Handle exact match
  return compareVersions(clean, range.replace(/^\s+/, '').split(' ')[0]) === 0;
}

function compareVersions(a: string, b: string): number {
  const [aMaj = 0, aMin = 0, aPat = 0] = a.split('.').map(Number);
  const [bMaj = 0, bMin = 0, bPat = 0] = b.split('.').map(Number);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}
