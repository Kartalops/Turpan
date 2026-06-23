# Turpan Analysis

## Verdict

⚠️ **CONDITIONAL_GO**

## Executive Summary

- ⚠️ **CONDITIONAL_GO** — project has 1 high and 0 medium severity findings that should be addressed
- Overall score: **97/100
- 🟠 1 high severity finding should be addressed before release
- Build health: **97/100**
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
| Report Version | 2026-06-20T10-05-09-282Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **97/100** |
| Build Health       | 97/100 |
| Test Health        | 100/100 |
| Code Quality       | 100/100 |
| Security           | 100/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 0 |
| 🟠 High     | 1 |
| 🟡 Medium   | 0 |
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

- `Missing node_modules`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-unprotected-admin/node_modules](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-unprotected-admin/node_modules) — Directory not found — node_modules is missing

## Medium Findings

_No medium severity findings._
## Low Findings

_No low severity findings._
## Evidence Index

### Logs

- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-unprotected-admin/.turpan/runs/2026-06-20T10-05-09-282Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-unprotected-admin/.turpan/runs/2026-06-20T10-05-09-282Z/TURPAN_FINDINGS.json) (2.4 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-unprotected-admin/.turpan/runs/2026-06-20T10-05-09-282Z/TURPAN_SCORECARD.json) (0.2 KB)
