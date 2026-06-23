# Turpan Analysis

## Verdict

✅ **GO**

## Executive Summary

- ✅ **GO** — project passes all critical checks with score 100/100
- Overall score: **100/100
- 🟡 1 medium severity finding planned for next sprint
- Build health: **100/100**
- Security posture: **100/100**
- Maintainability: **100/100**

## Project Fingerprint

| Property | Value |
|---------|-------|
| Project Name | unknown |
| App Type | unknown |
| Languages | unknown |
| Package Manager | unknown |
| UI Framework | unknown |
| Backend Framework | unknown |
| Test Tools | unknown |
| Commands | none detected |
| Routes | none detected |
| Runtime | Node.js |
| Report Version | 2026-06-20T10-49-29-374Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **100/100** |
| Build Health       | 100/100 |
| Test Health        | 100/100 |
| Code Quality       | 100/100 |
| Security           | 100/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 0 |
| 🟠 High     | 0 |
| 🟡 Medium   | 1 |
| 🟢 Low      | 0 |
| 🔵 Info     | 0 |

## Critical Findings

_No critical severity findings._
## High Findings

_No high severity findings._
## Medium Findings


### Lint script 'lint' found issues (exit code 2)


The linter reported issues. Review the output for details — these are style, quality, or potential bug findings.

**Suggested Fix:**

Fix lint issues manually or run with auto-fix: npm run lint -- --fix

**Evidence:**

- `lint-output`: 
> turpan@0.1.0 lint
> pnpm -r run lint

Scope: 8 of 9 workspace projects
packages/shared lint$ npx tsc --noEmit
packages/shared lint: npm warn Unknown env config "recursive". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
packages/shared lint: Done
packages/core lint$ npx tsc --noEmit
packages/ui-runner lint$ npx tsc --noEmit
packages/core lint: npm warn Unknown env config "recursive". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
packages/ui-runner lint: npm warn Unknown env config "recursive". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
packages/core lint: Done
packages/ui-runner lint: Done
apps/mcp-server lint$ npx tsc --noEmit
apps/mcp-server lint: npm warn Unknown env config "recursive". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
apps/mcp-server lint: tsconfig.json(14,5): error TS6306: Referenced project '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers' must have setting "composite": true.
apps/mcp-server lint: tsconfig.json(15,5): error TS6306: Referenced project '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/report' must have setting "composite": true.
apps/mcp-server lint: tsconfig.json(15,5): error TS6310: Referenced project '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/report' may not disable emit.
apps/mcp-server lint: tsconfig.json(16,5): error TS6306: Referenced project '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/ui-runner' must have setting "composite": true.
apps/mcp-server lint: Failed
/home/oguz/Masaüstü/TurPAN-Review-Agent/apps/mcp-server:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @turpan/mcp-server@0.1.0 lint: `npx tsc --noEmit`
Exit status 2

- `lint-log`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/latest/logs/lint-lint_2026-06-20T10-51-17-117Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/latest/logs/lint-lint_2026-06-20T10-51-17-117Z.log) — Full lint log saved to: /home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/latest/logs/lint-lint_2026-06-20T10-51-17-117Z.log

## Low Findings

_No low severity findings._
## Evidence Index

### Logs

- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/2026-06-20T10-49-29-374Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/2026-06-20T10-49-29-374Z/TURPAN_FINDINGS.json) (4.9 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/2026-06-20T10-49-29-374Z/TURPAN_SCORECARD.json) (0.2 KB)
