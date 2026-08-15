# Phase 20 — Dependency CVE Scanning, SBOM, and License Audit

**Date:** 2026-06-20
**Package:** `@turpan/dependency-audit`
**CLI commands:** `turpan dependency-audit`, `turpan review . --dependency-audit [--online]`

---

## Summary

Phase 20 adds a new `@turpan/dependency-audit` package that provides:
- Dependency inventory (Node `package.json` + lockfiles; Python `requirements.txt` + `pyproject.toml`)
- SBOM generation (internal format + CycloneDX 1.4 JSON)
- Offline CVE scanning via a bundled vulnerability database
- Online CVE scanning via OSV API and `npm audit` (explicit opt-in)
- License audit with configurable policy (GPL-family detection, unknown licenses, missing fields)
- Findings integrated into the standard Turpan report under `security` and `dependency` categories

---

## What was built

### Package: `@turpan/dependency-audit`

```
packages/dependency-audit/
├── src/
│   ├── types.ts          — shared TypeScript interfaces
│   ├── inventory.ts       — parses package.json/lockfiles/requirements.txt → DependencyInventory
│   ├── vulndb.ts         — offline vulnerability database (40+ entries)
│   ├── sbom.ts           — internal SBOM + CycloneDX 1.4 JSON generation
│   ├── license.ts        — GPL-family / unknown / missing license detection
│   ├── onlineScanner.ts  — OSV API + npm audit (only when --online)
│   └── index.ts          — runDependencyAudit() main entry point
├── tests/audit.test.ts   — 12 unit/integration tests
└── fixtures/            — 5 test fixture projects
```

### CLI integration

- New command: `turpan dependency-audit [path] [--online] [--json] [--fail-on-critical]`
- `turpan review . --dependency-audit` — adds CVE findings to the full review report
- `turpan review . --dependency-audit --online` — live OSV + npm audit

---

## Offline vs. Online Behavior

### Offline mode (default)

```
turpan dependency-audit .
turpan review . --dependency-audit
```

- **No network calls.** Ever.
- Uses the bundled `OFFLINE_VULNERABILITY_DATABASE` in `vulndb.ts`
- Matches by package name + semver range
- Returns the **most severe** matching vulnerability per package
- Always available; works in air-gapped environments

### Online mode (explicit opt-in)

```
turpan dependency-audit . --online
turpan review . --dependency-audit --online
```

- Calls `https://api.osv.dev/v1/query` (8s timeout)
- Calls `npm audit --json` via local npm CLI (15s timeout)
- All results are **redacted** before any display or storage
- Gracefully degrades to offline if either API fails or times out
- **Not enabled by default.** Must be explicitly requested.

---

## SBOM Format

### Internal format (`sbom.json`)

```json
{
  "format": "turpan-sbom",
  "version": "1.0",
  "projectName": "my-app",
  "projectVersion": "1.0.0",
  "components": [
    {
      "name": "lodash",
      "version": "4.17.18",
      "type": "library",
      "licenses": ["MIT"],
      "dependencyType": "prod"
    }
  ],
  "generatedAt": "2026-06-20T10:00:00.000Z",
  "generator": "turpan-dependency-audit"
}
```

### CycloneDX 1.4 (`sbom.cdx.json`)

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "version": 1,
  "metadata": {
    "timestamp": "2026-06-20T10:00:00.000Z",
    "tools": [{ "name": "turpan-dependency-audit" }],
    "component": { "type": "application", "name": "my-app", "version": "1.0.0" }
  },
  "components": [
    {
      "type": "library",
      "name": "lodash",
      "version": "4.17.18",
      "purl": "pkg:npm/lodash@4.17.18",
      "licenses": [{ "license": { "id": "MIT" } }]
    }
  ]
}
```

SBOM files are written to `.turpan/runs/<runId>/sbom.json` and `.turpan/runs/<runId>/sbom.cdx.json`.

---

## License Policy

Configured in `turpan.yml`:

```yaml
dependencyAudit:
  enabled: true
  online: false
  failOnCritical: true
  licensePolicy:
    disallowed:
      - GPL-3.0
      - AGPL-3.0
    warnUnknown: true
```

### License classification

| Classification | Risk | Examples |
|---|---|---|
| **Permissive** | None | MIT, Apache-2.0, BSD-2/3-Clause, ISC, CC0-1.0 |
| **GPL-family** | High | GPL-3.0, LGPL-2.1, AGPL-3.0 |
| **Unknown** | Medium | Any unrecognized SPDX ID |
| **Missing** | Medium | No license field |

### Severity mapping

- `disallowed` license → **high** finding, fails the audit
- Unknown license (if `warnUnknown: true`) → **medium** finding
- Missing license → **medium** finding
- Dev dependencies (unless `disallowed`) are excluded from license findings

---

## Config schema

Added to `packages/shared/src/types/index.ts`:

```typescript
export interface DependencyAuditConfig {
  enabled: boolean;        // default: false
  online: boolean;          // default: false (explicit opt-in)
  failOnCritical: boolean;  // default: true
  licensePolicy: {
    disallowed: string[];  // e.g. ['GPL-3.0', 'AGPL-3.0']
    warnUnknown: boolean;   // default: true
  };
}
```

Also added to `TurpanConfig` in the same file, and parsed in `packages/core/src/config/index.ts`.

---

## Limitations

1. **Bundled CVE database is a fixture, not real-time data.** Real CVE data requires OSV or a similar provider in online mode.
2. **Transitive dependencies** are detected only from lockfiles. Without a lockfile, only direct dependencies are scanned.
3. **Python poetry.lock and uv.lock** are not parsed (only `requirements.txt` and `pyproject.toml` dependencies).
4. **License detection** from `package.json` is unreliable — prefer lockfile `license` fields.
5. **No auto-update** of the vulnerability database. The offline DB must be updated with new CVE entries manually.
6. **No per-dependency exemption list** — all vulnerabilities are surfaced.
7. **`npm audit`** requires `npm` CLI to be installed and in PATH.

---

## Future CVE Provider Recommendations

To make the offline database production-grade, in decreasing order of effort:

1. **OSV bulk export** — Use `osv.dev` API in online mode for real-time data. Already wired in Phase 20.
2. **GitHub Advisory Database** — Bulk download `GHSA-*.json` files and parse into the offline DB.
3. **Socket.dev** — Provides deep diff analysis and alternative dependency analysis.
4. **Snyk** — Integrates license policy enforcement with automatic PR fixes.
5. **Renovate bot** — Auto-creates PRs to update vulnerable dependencies.
6. **OSS Index (Sonatype)** — Free API for CVE data without rate limits.
7. **WhiteSource** — Enterprise license and vulnerability management.

For production: use `--online` mode with OSV + `npm audit`, and pair with a Renovate bot for automated updates.

---

## Files Changed

| File | Change |
|---|---|
| `packages/dependency-audit/` | New package (7 source files, 1 test, 5 fixtures) |
| `packages/core/src/orchestrator/index.ts` | Added `dependencyAudit`, `dependencyAuditOnline`, `signal` options; wire dep audit into review pipeline |
| `packages/core/src/config/index.ts` | Parse `dependencyAudit` from turpan.yml |
| `packages/core/package.json` | Added `@turpan/dependency-audit` dependency |
| `apps/cli/src/commands/dependencyAudit.ts` | New standalone `dependency-audit` CLI command |
| `apps/cli/src/commands/review.ts` | Added `--dependency-audit` and `--online` flags |
| `apps/cli/src/commands/index.ts` | Export `createDependencyAuditCommand` |
| `apps/cli/src/index.ts` | Register `dependency-audit` command |
| `apps/cli/package.json` | Added `@turpan/dependency-audit` dependency |
| `packages/shared/src/types/index.ts` | Added `DependencyAuditConfig`, `DependencyAuditLicensePolicy`; extended `TurpanConfig` |
| `turpan.yml` | Added `dependencyAudit` config section |
| `docs/CLI_USAGE.md` | Documented `dependency-audit` command and flags |
| `docs/CONFIGURATION.md` | Documented `dependencyAudit` schema |
| `docs/SECURITY_MODEL.md` | Added dependency audit online-mode guard section |

---

## Validation

| Check | Command | Result |
|---|---|---|
| Build | `pnpm build` | ✅ All packages built |
| Unit tests | `pnpm test` | ✅ All 634 tests pass (12 new dep-audit tests) |
| Eval suite | `pnpm eval` | ⚠️ 1 pass, 7 warn, 8 fail (pre-existing gaps unrelated to Phase 20) |

Eval failures are in existing analyzers (e.g. FastAPI auth bypass, dead code detection) — none are caused by the dependency audit feature. The new feature is opt-in and does not affect existing review behavior.

---

## Final Verdict

**READY** — Dependency CVE scanning and license audit are implemented as specified: offline-first with explicit online opt-in, SBOM output, configurable license policy, findings integrated into the standard report, and full CLI and `turpan.yml` integration. The bundled CVE database is a fixture (not real-time) and is clearly documented as a limitation.
