/**
 * Dependency Audit Types — shared across the dependency-audit package
 */

export type DependencyType = 'prod' | 'dev' | 'optional' | 'peer';
export type DependencySource = 'direct' | 'transitive';

/** A single dependency entry in the inventory */
export interface DependencyEntry {
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
export interface DependencyInventory {
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
export interface VulnerabilityRecord {
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
export interface VulnerabilityFinding {
  dependency: DependencyEntry;
  vulnerability: VulnerabilityRecord;
  /** How this dep was introduced (for transitive) */
  path?: string[];
}

/** License audit result for a single package */
export interface LicenseFinding {
  dependency: DependencyEntry;
  license: string | null;
  risk: 'high' | 'medium' | 'low' | 'none';
  reason: string;
  policyViolation?: boolean;
}

/** SBOM component */
export interface SbomComponent {
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
export interface Sbom {
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
export interface DependencyAuditConfig {
  enabled: boolean;
  online: boolean;
  failOnCritical: boolean;
  licensePolicy: {
    disallowed: string[];
    warnUnknown: boolean;
  };
}

/** Combined audit result */
export interface DependencyAuditResult {
  inventory: DependencyInventory;
  vulnerabilities: VulnerabilityFinding[];
  licenseFindings: LicenseFinding[];
  sbom: Sbom;
  sbomCdx?: string; // CycloneDX JSON string
  mode: 'offline' | 'online';
  errors: string[];
}
