# Turpan Analysis

## Verdict

✅ **GO**

## Executive Summary

- ✅ **GO** — project passes all critical checks with score 99/100
- Overall score: **99/100
- 🟡 1 medium severity finding planned for next sprint
- Build health: **99/100**
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
| Report Version | 2026-06-20T10-21-20-667Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **99/100** |
| Build Health       | 99/100 |
| Test Health        | 95/100 |
| Code Quality       | 100/100 |
| Security           | 100/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 0 |
| 🟠 High     | 0 |
| 🟡 Medium   | 1 |
| 🟢 Low      | 0 |
| 🔵 Info     | 1 |

## Critical Findings

_No critical severity findings._
## High Findings

_No high severity findings._
## Medium Findings


### Missing test script in package.json


No `test` script was detected in package.json. The test stage will be skipped without a test command.

**Suggested Fix:**

Add a "test" script to package.json, e.g. "test": "vitest" or "test": "jest"

**Evidence:**

- `package.json`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/package.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/package.json) — {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit"
}

## Low Findings

_No low severity findings._
## Evidence Index

### Logs

- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/.turpan/runs/2026-06-20T10-21-20-667Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/.turpan/runs/2026-06-20T10-21-20-667Z/TURPAN_FINDINGS.json) (3.4 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/.turpan/runs/2026-06-20T10-21-20-667Z/TURPAN_SCORECARD.json) (0.2 KB)
