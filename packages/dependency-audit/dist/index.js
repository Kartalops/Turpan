// src/inventory.ts
import { readFileSync, existsSync } from "fs";
import { join } from "path";
function parsePackageJson(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function readLockfile(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function parsePnpmLock(path) {
  const raw = readFileSync(path, "utf-8");
  const result = /* @__PURE__ */ new Map();
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^  "([^@]+)@(.+)":$/);
    if (match) {
      const name = match[1];
      const version = match[2];
      const key = `${name}@${version}`;
      const dep = { version };
      i++;
      while (i < lines.length && lines[i].match(/^\s{4}/)) {
        const sub = lines[i].match(/^\s{4}(\w+):\s*(.+)/);
        if (sub) {
          if (sub[1] === "resolved") dep.resolved = sub[2].replace(/'/g, "").replace(/\\/g, "");
          else if (sub[1] === "license") dep.license = sub[2].replace(/'/g, "").replace(/\\/g, "");
        }
        i++;
      }
      result.set(key, dep);
    } else {
      i++;
    }
  }
  return result;
}
function parsePackageLock(path) {
  const lock = readLockfile(path);
  const result = /* @__PURE__ */ new Map();
  if (!lock?.dependencies) return result;
  function walk(name, entry) {
    const key = `${name}@${entry.version}`;
    result.set(key, {
      version: entry.version,
      resolved: entry.resolved,
      license: entry.license
    });
    if (entry.dependencies) {
      for (const [dep, sub] of Object.entries(entry.dependencies)) {
        walk(dep, sub);
      }
    }
  }
  for (const [name, entry] of Object.entries(lock.dependencies)) {
    walk(name, entry);
  }
  return result;
}
function detectNodeProjectType(projectPath) {
  if (existsSync(join(projectPath, "package.json"))) return "node";
  return "unknown";
}
function makeEntry(name, version, type, source, lockDeps, parent, sourceFile) {
  const key = `${name}@${version}`;
  const lockEntry = lockDeps.get(key);
  return {
    name,
    version,
    type,
    source,
    parent,
    resolvedVersion: lockEntry?.version !== version ? lockEntry?.version : void 0,
    license: lockEntry?.license,
    sourceFile
  };
}
function buildNodeInventory(projectPath) {
  const pkg = parsePackageJson(join(projectPath, "package.json"));
  const entries = [];
  const pnpmLock = join(projectPath, "pnpm-lock.yaml");
  const npmLock = join(projectPath, "package-lock.json");
  const yarnLock = join(projectPath, "yarn.lock");
  let lockDeps = /* @__PURE__ */ new Map();
  let lockfileType = "none";
  if (existsSync(pnpmLock)) {
    lockDeps = parsePnpmLock(pnpmLock);
    lockfileType = "pnpm";
  } else if (existsSync(npmLock)) {
    lockDeps = parsePackageLock(npmLock);
    lockfileType = "npm";
  } else if (existsSync(yarnLock)) {
    lockfileType = "yarn";
  }
  function addDeps(deps, type, source, parent, sourceFile) {
    if (!deps) return;
    for (const [name, version] of Object.entries(deps)) {
      entries.push(makeEntry(name, version, type, source, lockDeps, parent, sourceFile));
    }
  }
  if (pkg) {
    const pkgFile = join(projectPath, "package.json");
    addDeps(pkg.dependencies, "prod", "direct", void 0, pkgFile);
    addDeps(pkg.devDependencies, "dev", "direct", void 0, pkgFile);
    addDeps(pkg.peerDependencies, "peer", "direct", void 0, pkgFile);
    addDeps(pkg.optionalDependencies, "optional", "direct", void 0, pkgFile);
    if (lockDeps.size > 0) {
      const seen = new Set(entries.map((e) => `${e.name}@${e.version}`));
      const lockFile = pnpmLock !== "none" && existsSync(pnpmLock) ? pnpmLock : existsSync(npmLock) ? npmLock : void 0;
      for (const [key, lockEntry] of lockDeps.entries()) {
        if (!seen.has(key)) {
          const [name, version] = key.split("@");
          entries.push({
            name,
            version,
            type: "prod",
            source: "transitive",
            resolvedVersion: lockEntry.resolved,
            license: lockEntry.license,
            sourceFile: lockFile
          });
          seen.add(key);
        }
      }
    }
  }
  return {
    projectPath,
    projectType: "node",
    projectName: pkg?.name,
    projectVersion: pkg?.version,
    dependencies: entries,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function parseRequirementsTxt(path) {
  const deps = [];
  try {
    const raw = readFileSync(path, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^([a-zA-Z0-9_\-\.]+)([=<>!@].*)?$/);
      if (m) {
        deps.push({ name: m[1].toLowerCase(), version: m[2] ?? "*" });
      }
    }
  } catch {
  }
  return deps;
}
function parsePyprojectToml(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    const nameMatch = raw.match(/^\[project\]\s*\n\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = raw.match(/^\[project\]\s*\n\s*version\s*=\s*"([^"]+)"/m);
    const deps = {};
    const depBlock = raw.match(/^\[project\.dependencies\]\s*\n((?:\s+".+"\n?)+)/m);
    if (depBlock) {
      for (const line of depBlock[1].split("\n")) {
        const m = line.trim().match(/^([a-zA-Z0-9_\-\.]+)([=<>!@].*)?/);
        if (m) deps[m[1].toLowerCase()] = m[2] ?? "*";
      }
    }
    return {
      name: nameMatch?.[1],
      version: versionMatch?.[1],
      deps
    };
  } catch {
    return { deps: {} };
  }
}
function buildPythonInventory(projectPath) {
  const reqTxt = join(projectPath, "requirements.txt");
  const pyproject = join(projectPath, "pyproject.toml");
  const uvLock = join(projectPath, "uv.lock");
  const poetryLock = join(projectPath, "poetry.lock");
  const entries = [];
  const reqDeps = existsSync(reqTxt) ? parseRequirementsTxt(reqTxt) : [];
  for (const { name, version } of reqDeps) {
    entries.push({ name, version, type: "prod", source: "direct" });
  }
  if (existsSync(pyproject)) {
    const py = parsePyprojectToml(pyproject);
    for (const [name, version] of Object.entries(py.deps)) {
      if (!entries.find((e) => e.name === name)) {
        entries.push({ name, version, type: "prod", source: "direct" });
      }
    }
    return {
      projectPath,
      projectType: "python",
      projectName: py.name,
      projectVersion: py.version,
      dependencies: entries,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return {
    projectPath,
    projectType: "python",
    dependencies: entries,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function buildDependencyInventory(projectPath) {
  if (detectNodeProjectType(projectPath) === "node") {
    return buildNodeInventory(projectPath);
  }
  if (existsSync(join(projectPath, "requirements.txt")) || existsSync(join(projectPath, "pyproject.toml"))) {
    return buildPythonInventory(projectPath);
  }
  return {
    projectPath,
    projectType: "unknown",
    dependencies: [],
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/vulndb.ts
var OFFLINE_VULNERABILITY_DATABASE = [
  // ── Critical: Known exploited in the wild ────────────────────────────────
  {
    package: "event-stream",
    vulnerableVersions: "3.3.0 - 3.3.4",
    cveId: "CVE-2018-3728",
    cvssScore: 9.8,
    severity: "critical",
    title: "event-stream flatmap-stream malicious package",
    description: "The event-stream package 3.3.0\u20133.3.4 contained a malicious dependency (flatmap-stream) that attempted to steal cryptocurrency wallets. This was an intentional supply-chain attack.",
    exploitedInWild: true
  },
  {
    package: "flatmap-stream",
    vulnerableVersions: ">=0.0.0",
    severity: "critical",
    title: "flatmap-stream \u2014 malicious package in event-stream attack",
    description: "flatmap-stream was inserted as a dependency of event-stream and contained code designed to steal cryptocurrency keys.",
    exploitedInWild: true
  },
  // ── Transitive (commonly comes via other packages) ────────────────────────
  {
    package: "minimist",
    vulnerableVersions: "<1.2.6",
    cveId: "CVE-2021-44906",
    cvssScore: 9.8,
    severity: "critical",
    title: "minimist prototype pollution (transitive)",
    description: "minimist before 1.2.6 is vulnerable to prototype pollution. This package is frequently a transitive dependency of other tools.",
    exploitedInWild: false
  },
  // ── High ─────────────────────────────────────────────────────────────────
  {
    package: "lodash",
    vulnerableVersions: "<4.17.21",
    cveId: "CVE-2021-23337",
    cvssScore: 7.2,
    severity: "high",
    title: "Lodash prototype pollution via merge",
    description: "Lodash versions before 4.17.21 are vulnerable to prototype pollution via the merge function. An attacker can modify the prototype of Object.prototype causing property injection.",
    exploitedInWild: false
  },
  {
    package: "lodash",
    vulnerableVersions: "<4.17.19",
    cveId: "CVE-2019-10744",
    cvssScore: 9.1,
    severity: "critical",
    title: "Lodash prototype pollution via merge/mergeWith",
    description: "All versions of Lodash below 4.17.19 are vulnerable to prototype pollution. Functions merge, mergeWith, and defaultsDeep can be exploited.",
    exploitedInWild: true
  },
  {
    package: "minimist",
    vulnerableVersions: "<1.2.6",
    cveId: "CVE-2021-44906",
    cvssScore: 9.8,
    severity: "critical",
    title: "minimist prototype pollution",
    description: "minimist before 1.2.6 is vulnerable to prototype pollution. An attacker can set arbitrary properties on Object.prototype via constructor arguments.",
    exploitedInWild: false
  },
  {
    package: "node-fetch",
    vulnerableVersions: "<2.6.7",
    cveId: "CVE-2022-0235",
    cvssScore: 8.8,
    severity: "high",
    title: "node-fetch exposure of sensitive information",
    description: "node-fetch <2.6.7 does not enforce a security measure for cookies, allowing them to be sent to any origin. This can lead to session fixation or credential leakage.",
    exploitedInWild: false
  },
  {
    package: "xmlhttprequest",
    vulnerableVersions: "*",
    severity: "high",
    title: "xmlhttprequest \u2014 deprecated package with known RCE risk",
    description: "The xmlhttprequest npm package has known SSRF and RCE vulnerabilities and is no longer maintained. It should be replaced.",
    exploitedInWild: false
  },
  {
    package: "prompt-confirm",
    vulnerableVersions: "*",
    severity: "high",
    title: "prompt-confirm \u2014 benign name, malicious code",
    description: "The package prompt-confirm typosquatted the original prompt-confirm package and contained malicious code that copied .env files.",
    exploitedInWild: true
  },
  // ── Medium ───────────────────────────────────────────────────────────────
  {
    package: "glob-parent",
    vulnerableVersions: "<5.1.2",
    cveId: "CVE-2020-28469",
    cvssScore: 7.5,
    severity: "medium",
    title: "glob-parent ReDoS via malicious path",
    description: "glob-parent before 5.1.2 is vulnerable to regular expression denial of service (ReDoS) when a malicious path is provided.",
    exploitedInWild: false
  },
  {
    package: "nth-check",
    vulnerableVersions: "<2.0.1",
    cveId: "CVE-2021-3803",
    cvssScore: 9.1,
    severity: "critical",
    title: "nth-check ReDoS vulnerability",
    description: "nth-check before 2.0.1 is vulnerable to regular expression denial of service (ReDoS) via a crafted HTML input.",
    exploitedInWild: false
  },
  {
    package: "ansi-regex",
    vulnerableVersions: "<5.0.1",
    cveId: "CVE-2021-3807",
    cvssScore: 7.8,
    severity: "high",
    title: "ansi-regex ReDoS \u2014 terminal escape sequence injection",
    description: "ansi-regex before 5.0.1 is vulnerable to ReDoS from crafted input containing ANSI escape sequences.",
    exploitedInWild: false
  },
  {
    package: "immer",
    vulnerableVersions: "<9.0.6",
    cveId: "CVE-2021-23436",
    cvssScore: 8.2,
    severity: "high",
    title: "Immer prototype pollution vulnerability",
    description: "Immer before 9.0.6 is vulnerable to prototype pollution through the process tree, allowing an attacker to set arbitrary properties on Object.prototype.",
    exploitedInWild: false
  },
  {
    package: "ua-parser-js",
    vulnerableVersions: "<0.7.31",
    cveId: "CVE-2022-25927",
    cvssScore: 9.1,
    severity: "critical",
    title: "ua-parser-js malicious code injection via npm",
    description: "ua-parser-js was compromised via a malicious npm release that added cryptomining code. Versions <0.7.31 may contain the malicious payload.",
    exploitedInWild: true
  },
  {
    package: "colors",
    vulnerableVersions: "1.4.0 - 1.4.44",
    severity: "high",
    title: "colors \u2014 malicious commit inserted into npm package",
    description: "The colors npm package was backdoored via a malicious commit that added an infinite loop, causing applications to hang. This was an insider attack.",
    exploitedInWild: false
  },
  {
    package: "faker",
    vulnerableVersions: "<5.5.3",
    cveId: "CVE-2022-23634",
    cvssScore: 7.5,
    severity: "medium",
    title: "faker prototype pollution",
    description: "faker.js before 5.5.3 is vulnerable to prototype pollution through the setPath function.",
    exploitedInWild: false
  },
  // ── Python-specific ───────────────────────────────────────────────────────
  {
    package: "pyyaml",
    vulnerableVersions: "<5.4",
    cveId: "CVE-2020-14343",
    cvssScore: 9.8,
    severity: "critical",
    title: "PyYAML arbitrary code execution via Python object deserialization",
    description: "PyYAML before 5.4 allows Python object deserialization via the load() function. An attacker can execute arbitrary code by providing a malicious YAML payload.",
    exploitedInWild: true
  },
  {
    package: "django",
    vulnerableVersions: "<3.2.20",
    cveId: "CVE-2023-36053",
    cvssScore: 9.8,
    severity: "critical",
    title: "Django potential SQL injection via CMSPlugin.model",
    description: "Django before 3.2.20 allows SQL injection via model kwargs when using certain query methods.",
    exploitedInWild: false
  },
  {
    package: "requests",
    vulnerableVersions: "<2.20.0",
    cveId: "CVE-2018-18074",
    cvssScore: 7.5,
    severity: "medium",
    title: "Requests session cookie exposure",
    description: "requests before 2.20.0 could expose a cookie URL if it contains a redirect to a different host, leaking sensitive data.",
    exploitedInWild: false
  },
  {
    package: "pillow",
    vulnerableVersions: "<8.3.2",
    cveId: "CVE-2022-22817",
    cvssScore: 9.8,
    severity: "critical",
    title: "Pillow arbitrary code execution via PIL.ImageMath",
    description: "Pillow before 8.3.2 allows arbitrary code execution via the eval function in PIL.ImageMath.",
    exploitedInWild: true
  },
  {
    package: "numpy",
    vulnerableVersions: "<1.22.0",
    cvssScore: 7.4,
    severity: "medium",
    title: "NumPy buffer overflow via tostring",
    description: "NumPy before 1.22.0 has a buffer overflow in numpy.core.numeric.toString due to improper input validation.",
    exploitedInWild: false
  },
  {
    package: "setuptools",
    vulnerableVersions: "<65.5.1",
    cveId: "CVE-2022-40897",
    cvssScore: 7.5,
    severity: "medium",
    title: "setuptools wheel.install vulnerable to dependency confusion",
    description: "setuptools before 65.5.1 is vulnerable to dependency confusion by not properly validating packages from PyPI versus locally specified versions.",
    exploitedInWild: false
  }
];
function matchVulnerabilities(packageName, version) {
  const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  let best = null;
  for (const vuln of OFFLINE_VULNERABILITY_DATABASE) {
    if (vuln.package === packageName) {
      if (versionInRange(version, vuln.vulnerableVersions)) {
        const a = SEVERITY_ORDER[best?.severity ?? "none"] ?? 0;
        const b = SEVERITY_ORDER[vuln.severity] ?? 0;
        if (b > a) {
          best = vuln;
        }
      }
    }
  }
  return best;
}
function versionInRange(version, range) {
  const clean = version.replace(/^[~^>=<!\s]+/, "").split("-")[0].split("+")[0];
  const [vMaj, vMin, vPat] = clean.split(".").map(Number);
  if (range === "*" || range === ">=0.0.0") return true;
  const rangeMatch = range.match(/^[\s~^>=<]*([\d.]+)\s*-\s*([\d.]+)$/);
  if (rangeMatch) {
    const [, low, high] = rangeMatch;
    return compareVersions(clean, low) >= 0 && compareVersions(clean, high) <= 0;
  }
  const prefix = range.match(/^([~^>=<]+)([\d.]+)/);
  if (prefix) {
    const [, op, target] = prefix;
    if (op === "^") {
      const [tMaj] = target.split(".").map(Number);
      return vMaj === tMaj;
    }
    if (op === "~") {
      const [tMaj, tMin] = target.split(".").map(Number);
      return vMaj === tMaj && vMin === tMin;
    }
    if (op === ">=") return compareVersions(clean, target) >= 0;
    if (op === ">") return compareVersions(clean, target) > 0;
    if (op === "<=") return compareVersions(clean, target) <= 0;
    if (op === "<") return compareVersions(clean, target) < 0;
    if (op === "=") return compareVersions(clean, target) === 0;
  }
  return compareVersions(clean, range.replace(/^\s+/, "").split(" ")[0]) === 0;
}
function compareVersions(a, b) {
  const [aMaj = 0, aMin = 0, aPat = 0] = a.split(".").map(Number);
  const [bMaj = 0, bMin = 0, bPat = 0] = b.split(".").map(Number);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

// src/sbom.ts
function depToComponent(dep, vulnCount = 0) {
  const ecosystem = dep.sourceFile?.endsWith("requirements.txt") || dep.sourceFile?.endsWith("pyproject.toml") ? "pypi" : dep.sourceFile?.includes("package.json") ? "npm" : "unknown";
  return {
    name: dep.name,
    version: dep.version,
    ecosystem,
    type: "library",
    licenses: dep.license ? [dep.license] : void 0,
    dependencyType: dep.type,
    source: dep.source,
    sourceFile: dep.sourceFile,
    vulnerabilities: vulnCount > 0 ? vulnCount : void 0
  };
}
function buildSbom(inventory, vulnerabilities = []) {
  const vulnCountByDep = /* @__PURE__ */ new Map();
  for (const vf of vulnerabilities) {
    const key = `${vf.dependency.name}@${vf.dependency.version}`;
    vulnCountByDep.set(key, (vulnCountByDep.get(key) ?? 0) + 1);
  }
  return {
    format: "turpan-sbom",
    version: "1.0",
    projectName: inventory.projectName ?? "unknown",
    projectVersion: inventory.projectVersion,
    projectEcosystem: inventory.projectType === "node" ? "npm" : inventory.projectType === "python" ? "pypi" : "unknown",
    components: inventory.dependencies.map((dep) => {
      const key = `${dep.name}@${dep.version}`;
      return depToComponent(dep, vulnCountByDep.get(key) ?? 0);
    }),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    generator: "turpan-dependency-audit"
  };
}
function buildCycloneDx(sbom) {
  const components = sbom.components.map((c) => {
    const ecosystem = c.ecosystem ?? "unknown";
    const scheme = ecosystem === "pypi" ? "pypi" : ecosystem === "npm" ? "npm" : "unknown";
    const purl = scheme !== "unknown" ? `pkg:${scheme}/${c.name}@${c.version}` : void 0;
    return {
      type: "library",
      name: c.name,
      version: c.version,
      purl,
      licenses: c.licenses ? c.licenses.map((l) => ({ license: { id: l } })) : [{ license: { id: "NOASSERTION" } }]
    };
  });
  const doc = {
    bomFormat: "CycloneDX",
    specVersion: "1.4",
    version: 1,
    metadata: {
      timestamp: sbom.generatedAt,
      tools: [{ name: sbom.generator }],
      component: {
        type: "application",
        name: sbom.projectName,
        version: sbom.projectVersion
      }
    },
    components
  };
  return JSON.stringify(doc, null, 2);
}

// src/license.ts
var OSI_APPROVED = /* @__PURE__ */ new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Artistic-2.0",
  "BSL-1.0",
  "CDDL-1.0",
  "CPL-1.0",
  "EPL-1.0",
  "EPL-2.0",
  "EUPL-1.1",
  "EUPL-1.2",
  "GPL-2.0-only",
  "GPL-3.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0-or-later",
  "LGPL-2.0-only",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "MPL-1.0",
  "MPL-1.1",
  "MPL-2.0",
  "Ms-PL",
  "PostgreSQL",
  "OFL-1.0",
  "OFL-1.1",
  "OSL-1.0",
  "OSL-2.0",
  "OSL-2.1",
  "OSL-3.0",
  "QPL-1.0",
  "QPL-1.0-InferNet",
  "Ruby",
  "SSPL-1.0",
  "UPL-1.0",
  "Vim",
  "X11",
  "Zlib",
  "WTFPL",
  "Unlicense"
]);
var GPL_FAMILY = /* @__PURE__ */ new Set([
  "GPL-2.0-only",
  "GPL-3.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0-or-later",
  "LGPL-2.0-only",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later"
]);
var PERMISSIVE = /* @__PURE__ */ new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC0-1.0",
  "Unlicense",
  "WTFPL",
  "Zlib",
  "0BSD"
]);
function normalizeLicense(license) {
  if (!license) return null;
  const cleaned = license.replace(/\s+/g, " ").replace(/[\(\)]/g, "").trim();
  const upper = cleaned.toUpperCase().replace(/\s+/g, "-");
  return upper;
}
function classifyLicense(license) {
  if (!license) return "missing";
  const norm = normalizeLicense(license) ?? "";
  if (PERMISSIVE.has(norm)) return "permissive";
  if (GPL_FAMILY.has(norm)) return "gpl";
  if (OSI_APPROVED.has(norm)) return "permissive";
  if (norm.startsWith("GPL") || norm.startsWith("LGPL") || norm.startsWith("AGPL")) return "gpl";
  if (norm.includes("UNKNOWN") || norm.includes("CUSTOM") || norm.includes("INVALID")) return "unknown";
  if (norm.length < 3) return "missing";
  return "unknown";
}
function licenseRisk(classification) {
  switch (classification) {
    case "gpl":
      return "high";
    case "unknown":
      return "medium";
    case "missing":
      return "medium";
    case "permissive":
      return "none";
  }
}
function riskReason(license, classification) {
  if (!license) {
    return "No license field found. This package may not have an explicit license, making legal use unclear.";
  }
  switch (classification) {
    case "gpl":
      return `GPL-family license detected (${license}). This is a strong copyleft license \u2014 derivative works must also be open source under the same license. May conflict with proprietary or SaaS distribution.`;
    case "unknown":
      return `License "${license}" is not recognized as an OSI-approved license. Please verify the license is appropriate for your project.`;
    case "missing":
      return `No license information found for this package.`;
    case "permissive":
      return `License "${license}" is a permissive license with no copyleft restrictions.`;
  }
}
function auditLicenses(inventory, config) {
  const findings = [];
  for (const dep of inventory.dependencies) {
    const raw = dep.license ?? null;
    const classification = classifyLicense(raw);
    const baseRisk = licenseRisk(classification);
    const isDisallowed = config.licensePolicy.disallowed.some(
      (d) => raw?.toUpperCase().includes(d.toUpperCase())
    );
    if (dep.type === "dev" && baseRisk !== "none" && !isDisallowed) {
      continue;
    }
    findings.push({
      dependency: dep,
      license: raw,
      risk: isDisallowed ? "high" : baseRisk,
      reason: isDisallowed ? `License "${raw}" is explicitly disallowed by your dependencyAudit.licensePolicy.` : riskReason(raw, classification),
      policyViolation: isDisallowed
    });
  }
  return findings;
}

// src/onlineScanner.ts
function redactDep(dep) {
  return {
    ...dep,
    name: dep.name.replace(/^(.):(.+)/, (_, f, r) => `${f[0]}***${r.slice(-2)}`),
    version: dep.version.length > 3 ? `${dep.version[0]}***` : dep.version
  };
}
var OSV_API = "https://api.osv.dev/v1/query";
var OSV_TIMEOUT_MS = 8e3;
async function queryOsv(dep, signal) {
  const pkg = dep.name;
  const version = dep.version;
  let ecosystem = "npm";
  if (pkg.includes("/") && !pkg.startsWith("@")) ecosystem = "Go";
  else if (/^[\d]/.test(pkg)) ecosystem = "PyPI";
  else if (pkg.includes("-") && !pkg.includes("@")) ecosystem = "PyPI";
  try {
    const resp = await fetch(OSV_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package: { name: pkg, ecosystem },
        version
      }),
      signal
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.vulns ?? [];
  } catch {
    return [];
  }
}
function osvToVuln(dep, osv) {
  const score = osv.severity?.[0]?.score ?? "";
  const cvss = parseFloat(score);
  const severity = cvss >= 9 ? "critical" : cvss >= 7 ? "high" : cvss >= 4 ? "medium" : "low";
  return {
    dependency: redactDep(dep),
    vulnerability: {
      package: dep.name,
      vulnerableVersions: osv.id,
      cveId: osv.id.startsWith("CVE-") ? osv.id : void 0,
      cvssScore: isNaN(cvss) ? void 0 : cvss,
      severity,
      title: osv.summary ?? osv.id,
      description: osv.details ?? ""
    }
  };
}
async function runNpmAudit(projectPath, signal) {
  try {
    const { execSync } = await import("child_process");
    const result = execSync("npm audit --json", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 15e3
    });
    const parsed = JSON.parse(result);
    const advisories = parsed.advisories ?? {};
    return Object.values(advisories).map((a) => ({
      dep: { name: a.module_name, version: a.findings?.[0]?.version ?? "*", type: "prod", source: "direct" },
      advisory: a
    }));
  } catch (e) {
    if (signal.aborted) throw e;
    return [];
  }
}
async function onlineScan(inventory, signal) {
  const findings = [];
  const errors = [];
  const directProd = inventory.dependencies.filter((d) => d.source === "direct" && d.type === "prod");
  let usedOsv = false;
  for (const dep of directProd) {
    signal.throwIfAborted();
    const vulns = await Promise.race([
      queryOsv(dep, signal),
      new Promise((resolve) => setTimeout(() => resolve([]), OSV_TIMEOUT_MS))
    ]);
    usedOsv = true;
    if (vulns.length > 0) {
      for (const v of vulns) {
        findings.push(osvToVuln(dep, v));
      }
    }
  }
  let usedNpmAudit = false;
  if (inventory.projectType === "node") {
    const npmResults = await Promise.race([
      runNpmAudit(inventory.projectPath, signal),
      new Promise((resolve) => setTimeout(() => resolve([]), 15e3))
    ]);
    usedNpmAudit = true;
    for (const { dep, advisory } of npmResults) {
      findings.push({
        dependency: redactDep(dep),
        vulnerability: {
          package: dep.name,
          vulnerableVersions: advisory.findings?.[0]?.paths?.join(" \u2192 ") ?? "unknown",
          cveId: advisory.url?.match(/CVE-\d+-\d+/)?.[0],
          severity: advisory.severity ?? "medium",
          title: advisory.title ?? "NPM advisory",
          description: `NPM advisory: ${advisory.title}`
        }
      });
    }
  }
  for (const dep of inventory.dependencies) {
    const vuln = matchVulnerabilities(dep.name, dep.version);
    if (vuln && !findings.some((f) => f.vulnerability.cveId === vuln.cveId && f.dependency.name === dep.name)) {
      findings.push({
        dependency: redactDep(dep),
        vulnerability: vuln
      });
    }
  }
  return { findings, errors, usedOsv, usedNpmAudit };
}
function offlineScan(inventory) {
  const findings = [];
  for (const dep of inventory.dependencies) {
    const vuln = matchVulnerabilities(dep.name, dep.version);
    if (vuln) {
      findings.push({
        dependency: dep,
        vulnerability: vuln
      });
    }
  }
  return findings;
}

// src/index.ts
import { mkdirSync, writeFileSync } from "fs";
import { join as join2 } from "path";
async function runDependencyAudit(projectPath, config = {}, runId, abortSignal) {
  const fullConfig = {
    enabled: config.enabled ?? false,
    online: config.online ?? false,
    failOnCritical: config.failOnCritical ?? true,
    licensePolicy: {
      disallowed: config.licensePolicy?.disallowed ?? [],
      warnUnknown: config.licensePolicy?.warnUnknown ?? true
    }
  };
  const errors = [];
  let inventory;
  try {
    inventory = buildDependencyInventory(projectPath);
  } catch (e) {
    errors.push(`Failed to build dependency inventory: ${e instanceof Error ? e.message : String(e)}`);
    inventory = {
      projectPath,
      projectType: "unknown",
      dependencies: [],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  let vulnerabilities = [];
  let scanMode = "offline";
  if (!fullConfig.enabled) {
    vulnerabilities = [];
  } else if (fullConfig.online && !abortSignal?.aborted) {
    scanMode = "online";
    const signal = abortSignal ?? new AbortController().signal;
    const result = await onlineScan(inventory, signal);
    vulnerabilities = result.findings;
    errors.push(...result.errors);
  } else {
    vulnerabilities = offlineScan(inventory);
  }
  const sbom = buildSbom(inventory, vulnerabilities);
  const sbomCdx = buildCycloneDx(sbom);
  if (runId) {
    const runDir = join2(projectPath, ".turpan", "runs", runId);
    try {
      mkdirSync(runDir, { recursive: true });
      writeFileSync(join2(runDir, "sbom.json"), JSON.stringify(sbom, null, 2), "utf-8");
      writeFileSync(join2(runDir, "sbom.cdx.json"), sbomCdx, "utf-8");
    } catch (e) {
      errors.push(`Failed to write SBOM files: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const licenseFindings = fullConfig.enabled ? auditLicenses(inventory, fullConfig) : [];
  return {
    inventory,
    vulnerabilities,
    licenseFindings,
    sbom,
    sbomCdx,
    mode: scanMode,
    errors
  };
}
export {
  OFFLINE_VULNERABILITY_DATABASE,
  auditLicenses,
  buildCycloneDx,
  buildDependencyInventory,
  buildNodeInventory,
  buildPythonInventory,
  buildSbom,
  matchVulnerabilities,
  offlineScan,
  onlineScan,
  runDependencyAudit
};
