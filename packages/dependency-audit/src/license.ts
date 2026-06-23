/**
 * License Audit — detect GPL-family, unknown, and missing licenses.
 */

import type { DependencyEntry, LicenseFinding, DependencyAuditConfig } from './types.js';

/** Known OSI-approved license identifiers (SPDX format) */
const OSI_APPROVED = new Set([
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC',
  'Artistic-2.0', 'BSL-1.0', 'CDDL-1.0', 'CPL-1.0', 'EPL-1.0',
  'EPL-2.0', 'EUPL-1.1', 'EUPL-1.2', 'GPL-2.0-only', 'GPL-3.0-only',
  'GPL-2.0-or-later', 'GPL-3.0-or-later', 'LGPL-2.0-only', 'LGPL-2.1-only',
  'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'MPL-1.0',
  'MPL-1.1', 'MPL-2.0', 'Ms-PL', 'PostgreSQL', 'OFL-1.0', 'OFL-1.1',
  'OSL-1.0', 'OSL-2.0', 'OSL-2.1', 'OSL-3.0', 'QPL-1.0', 'QPL-1.0-InferNet',
  'Ruby', 'SSPL-1.0', 'UPL-1.0', 'Vim', 'X11', 'Zlib', 'WTFPL', 'Unlicense',
]);

/** GPL family — copyleft that may be problematic for proprietary projects */
const GPL_FAMILY = new Set([
  'GPL-2.0-only', 'GPL-3.0-only', 'GPL-2.0-or-later', 'GPL-3.0-or-later',
  'LGPL-2.0-only', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only',
  'LGPL-3.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
]);

/** Public domain / permissive */
const PERMISSIVE = new Set([
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0',
  'Unlicense', 'WTFPL', 'Zlib', '0BSD',
]);

function normalizeLicense(license: string | null | undefined): string | null {
  if (!license) return null;
  const cleaned = license
    .replace(/\s+/g, ' ')
    .replace(/[\(\)]/g, '')
    .trim();
  // SPDX identifiers are upper case with hyphens
  const upper = cleaned.toUpperCase().replace(/\s+/g, '-');
  return upper;
}

function classifyLicense(license: string | null): 'permissive' | 'gpl' | 'unknown' | 'missing' {
  if (!license) return 'missing';
  const norm = normalizeLicense(license) ?? '';

  if (PERMISSIVE.has(norm)) return 'permissive';
  if (GPL_FAMILY.has(norm)) return 'gpl';
  if (OSI_APPROVED.has(norm)) return 'permissive';
  // Check for partial matches
  if (norm.startsWith('GPL') || norm.startsWith('LGPL') || norm.startsWith('AGPL')) return 'gpl';
  if (norm.includes('UNKNOWN') || norm.includes('CUSTOM') || norm.includes('INVALID')) return 'unknown';
  if (norm.length < 3) return 'missing';
  return 'unknown';
}

function licenseRisk(classification: ReturnType<typeof classifyLicense>): 'high' | 'medium' | 'low' | 'none' {
  switch (classification) {
    case 'gpl': return 'high';
    case 'unknown': return 'medium';
    case 'missing': return 'medium';
    case 'permissive': return 'none';
  }
}

function riskReason(license: string | null, classification: ReturnType<typeof classifyLicense>): string {
  if (!license) {
    return 'No license field found. This package may not have an explicit license, making legal use unclear.';
  }
  switch (classification) {
    case 'gpl':
      return `GPL-family license detected (${license}). This is a strong copyleft license — derivative works must also be open source under the same license. May conflict with proprietary or SaaS distribution.`;
    case 'unknown':
      return `License "${license}" is not recognized as an OSI-approved license. Please verify the license is appropriate for your project.`;
    case 'missing':
      return `No license information found for this package.`;
    case 'permissive':
      return `License "${license}" is a permissive license with no copyleft restrictions.`;
  }
}

/**
 * Audit all dependencies in the inventory for license compliance.
 */
export function auditLicenses(
  inventory: { dependencies: DependencyEntry[] },
  config: DependencyAuditConfig,
): LicenseFinding[] {
  const findings: LicenseFinding[] = [];

  for (const dep of inventory.dependencies) {
    const raw = dep.license ?? null;
    const classification = classifyLicense(raw);

    // Determine risk based on classification + config
    const baseRisk = licenseRisk(classification);
    const isDisallowed = config.licensePolicy.disallowed.some(d =>
      raw?.toUpperCase().includes(d.toUpperCase())
    );

    // Skip dev-only deps unless they violate disallowed list
    if (dep.type === 'dev' && baseRisk !== 'none' && !isDisallowed) {
      continue;
    }

    findings.push({
      dependency: dep,
      license: raw,
      risk: isDisallowed ? 'high' : baseRisk,
      reason: isDisallowed
        ? `License "${raw}" is explicitly disallowed by your dependencyAudit.licensePolicy.`
        : riskReason(raw, classification),
      policyViolation: isDisallowed,
    });
  }

  return findings;
}
