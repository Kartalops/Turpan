# Turpan Analysis

## Verdict

⚠️ **CONDITIONAL_GO**

## Executive Summary

- ⚠️ **CONDITIONAL_GO** — project has 1 high and 1 medium severity findings that should be addressed
- Overall score: **96/100
- 🟠 1 high severity finding should be addressed before release
- 🟡 1 medium severity finding planned for next sprint
- Build health: **96/100**
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
| Report Version | 2026-06-20T10-05-10-262Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **96/100** |
| Build Health       | 96/100 |
| Test Health        | 95/100 |
| Code Quality       | 100/100 |
| Security           | 100/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 0 |
| 🟠 High     | 1 |
| 🟡 Medium   | 1 |
| 🟢 Low      | 0 |
| 🔵 Info     | 0 |

## Critical Findings

_No critical severity findings._
## High Findings


### Dependencies not installed — install required before review


The node_modules directory is missing. Turpan cannot run build, test, lint, or typecheck without first installing dependencies. Run your package manager install command before re-running the review, or pass the --install flag to have Turpan install automatically (if configured).

**Suggested Fix:**

Run: npm install

**Evidence:**

- `Missing node_modules`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/node_modules](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/node_modules) — Directory not found — node_modules is missing

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

- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/.turpan/runs/2026-06-20T10-05-10-262Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/.turpan/runs/2026-06-20T10-05-10-262Z/TURPAN_FINDINGS.json) (3.4 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/vite-ui-console-error/.turpan/runs/2026-06-20T10-05-10-262Z/TURPAN_SCORECARD.json) (0.2 KB)
