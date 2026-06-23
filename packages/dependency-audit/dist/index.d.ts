/**
 * Dependency Audit Types — shared across the dependency-audit package
 */
type DependencyType = 'prod' | 'dev' | 'optional' | 'peer';
type DependencySource = 'direct' | 'transitive';
/** A single dependency entry in the inventory */
interface DependencyEntry {
    name: string;
    version: string;
    type: DependencyType;
    source: DependencySource;
    /** Resolved version (for aliases/URL deps) */
    resolvedVersion?: string;
    /** For transitive deps, who listed it */
    parent?: string;
    /** License from package.json (unreliable — prefer lockfile) */
    license?: string;
    /** Whether this is a bundled/focused dependency */
    bundled?: boolean;
    /** Absolute path to the file that declared this dependency */
    sourceFile?: string;
}
/** The complete dependency inventory for a project */
interface DependencyInventory {
    projectPath: string;
    projectType: 'node' | 'python' | 'unknown';
    /** Name from package.json / pyproject.toml */
    projectName?: string;
    /** Version from package.json / pyproject.toml */
    projectVersion?: string;
    dependencies: DependencyEntry[];
    /** Parsed at */
    timestamp: string;
}
/** A known vulnerability record (offline database entry) */
interface VulnerabilityRecord {
    /** Package name pattern (exact or glob) */
    package: string;
    /** Affected version range (semver range or exact) */
    vulnerableVersions: string;
    /** CVE ID if available */
    cveId?: string;
    /** CVSS v3 score (0-10) */
    cvssScore?: number;
    /** High/Medium/Low/None */
    severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
    /** Human-readable title */
    title: string;
    /** What the vulnerability allows */
    description: string;
    /** Was this exploited in the wild */
    exploitedInWild?: boolean;
}
/** A vulnerability finding for a specific dependency */
interface VulnerabilityFinding {
    dependency: DependencyEntry;
    vulnerability: VulnerabilityRecord;
    /** How this dep was introduced (for transitive) */
    path?: string[];
}
/** License audit result for a single package */
interface LicenseFinding {
    dependency: DependencyEntry;
    license: string | null;
    risk: 'high' | 'medium' | 'low' | 'none';
    reason: string;
    policyViolation?: boolean;
}
/** SBOM component */
interface SbomComponent {
    name: string;
    version: string;
    ecosystem: 'npm' | 'pypi' | 'unknown';
    type: 'library' | 'application' | 'framework';
    purl?: string;
    licenses?: string[];
    dependencyType?: DependencyType;
    source?: DependencySource;
    sourceFile?: string;
    vulnerabilities?: number;
}
/** Internal SBOM format */
interface Sbom {
    format: 'turpan-sbom';
    version: '1.0';
    projectName: string;
    projectVersion?: string;
    projectEcosystem?: 'npm' | 'pypi' | 'unknown';
    components: SbomComponent[];
    generatedAt: string;
    generator: 'turpan-dependency-audit';
}
/** Audit configuration from turpan.yml */
interface DependencyAuditConfig {
    enabled: boolean;
    online: boolean;
    failOnCritical: boolean;
    licensePolicy: {
        disallowed: string[];
        warnUnknown: boolean;
    };
}
/** Combined audit result */
interface DependencyAuditResult {
    inventory: DependencyInventory;
    vulnerabilities: VulnerabilityFinding[];
    licenseFindings: LicenseFinding[];
    sbom: Sbom;
    sbomCdx?: string;
    mode: 'offline' | 'online';
    errors: string[];
}

/**
 * DependencyInventory — parses package.json, lockfiles, requirements.txt
 * to produce a unified DependencyInventory.
 */

/**
 * Build DependencyInventory for a Node.js project.
 */
declare function buildNodeInventory(projectPath: string): DependencyInventory;
declare function buildPythonInventory(projectPath: string): DependencyInventory;
/**
 * Auto-detect project type and build the dependency inventory.
 */
declare function buildDependencyInventory(projectPath: string): DependencyInventory;

/**
 * VulnerabilityDatabase — offline bundle of known vulnerable packages.
 *
 * This is a conservative fixture database. In offline mode, Turpan
 * matches dependencies against this list. In online mode, the same
 * logic is used as a pre-filter before calling OSV/npm audit.
 *
 * Format mirrors OSV schema: https://osv.dev/schema
 */

/**
 * Offline vulnerability database.
 * Each entry describes a known vulnerable package + version range.
 *
 * Real production CVE data would come from OSV (osv.dev) in online mode.
 */
declare const OFFLINE_VULNERABILITY_DATABASE: VulnerabilityRecord[];
/**
 * Match a package name + version against the offline vulnerability database.
 * Returns the MOST SEVERE matching VulnerabilityRecord for the given package
 * (or null if no match). Security scanners should surface the worst-case result.
 */
declare function matchVulnerabilities(packageName: string, version: string): VulnerabilityRecord | null;

/**
 * SBOM Generator — produces internal SBOM and optional CycloneDX JSON.
 */

/**
 * Build the internal SBOM from a DependencyInventory.
 * @param inventory  The dependency inventory
 * @param vulnerabilities  Optional vulnerability findings to annotate components with vuln count
 */
declare function buildSbom(inventory: DependencyInventory, vulnerabilities?: VulnerabilityFinding[]): Sbom;
/**
 * CycloneDX 1.4 JSON serialization.
 * https://cyclonedx.org/docs/1.4/json/
 */
declare function buildCycloneDx(sbom: Sbom): string;

/**
 * License Audit — detect GPL-family, unknown, and missing licenses.
 */

/**
 * Audit all dependencies in the inventory for license compliance.
 */
declare function auditLicenses(inventory: {
    dependencies: DependencyEntry[];
}, config: DependencyAuditConfig): LicenseFinding[];

/**
 * OnlineScanner — calls external APIs for CVE data (OSV, npm audit).
 * Only used when --online flag is explicitly passed.
 * All outputs are redacted. Timeouts are enforced.
 */

/**
 * Run online CVE scan for a dependency inventory.
 * Falls back to offline matching when external APIs fail or time out.
 * Returns offline results filtered + enriched by online data.
 */
declare function onlineScan(inventory: DependencyInventory, signal: AbortSignal): Promise<{
    findings: VulnerabilityFinding[];
    errors: string[];
    usedOsv: boolean;
    usedNpmAudit: boolean;
}>;
/**
 * Run offline CVE scan only (no network calls).
 */
declare function offlineScan(inventory: DependencyInventory): VulnerabilityFinding[];

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

/**
 * Run the full dependency audit pipeline.
 *
 * @param projectPath  Path to the project to audit
 * @param config       Audit configuration (from turpan.yml or defaults)
 * @param runId       Optional run ID for SBOM output path
 * @param abortSignal  Optional AbortSignal for cancellation
 */
declare function runDependencyAudit(projectPath: string, config?: Partial<DependencyAuditConfig>, runId?: string, abortSignal?: AbortSignal): Promise<DependencyAuditResult>;

export { type DependencyAuditConfig, type DependencyAuditResult, type DependencyEntry, type DependencyInventory, type DependencySource, type DependencyType, type LicenseFinding, OFFLINE_VULNERABILITY_DATABASE, type Sbom, type SbomComponent, type VulnerabilityFinding, type VulnerabilityRecord, auditLicenses, buildCycloneDx, buildDependencyInventory, buildNodeInventory, buildPythonInventory, buildSbom, matchVulnerabilities, offlineScan, onlineScan, runDependencyAudit };
