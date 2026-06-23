# Turpan Analysis

## Verdict

❌ **NO_GO**

## Executive Summary

- ❌ **NO_GO** — project has 1 critical findings that must be resolved before release
- Overall score: **88/100
- 🔴 1 critical finding requires immediate attention
- 🟠 2 high severity findings should be addressed before release
- Build health: **88/100**
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
| Report Version | 2026-06-19T18-59-26-385Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **88/100** |
| Build Health       | 88/100 |
| Test Health        | 89/100 |
| Code Quality       | 100/100 |
| Security           | 100/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 1 |
| 🟠 High     | 2 |
| 🟡 Medium   | 0 |
| 🟢 Low      | 0 |
| 🔵 Info     | 0 |

## Critical Findings


### Build script 'build' failed with exit code 127


The build command exited with a non-zero exit code. This typically means a compilation error, missing dependency, or configuration issue.

**Suggested Fix:**

Run the build manually to see full error: npm run build

**Evidence:**

- `build-failure`: 
> fake-saas-app@0.1.0 build
> next build


- `build-log`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/latest/logs/build-build_2026-06-19T18-59-26-500Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/latest/logs/build-build_2026-06-19T18-59-26-500Z.log) — Full build log saved to: /home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/latest/logs/build-build_2026-06-19T18-59-26-500Z.log

## High Findings


### Dependencies not installed — install required before review


The node_modules directory is missing. Turpan cannot run build, test, lint, or typecheck without first installing dependencies. Run your package manager install command before re-running the review, or pass the --install flag to have Turpan install automatically (if configured).

**Suggested Fix:**

Run: npm install

**Evidence:**

- `Missing node_modules`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/node_modules](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/node_modules) — Directory not found — node_modules is missing

### Test script 'test' failed with exit code 1


The test command exited with a non-zero code, possibly a configuration or setup issue.

**Suggested Fix:**

Run tests manually to see failure details: npm run test

**Evidence:**

- `test-failure`: 
> fake-saas-app@0.1.0 test
> vitest


 RUN  v3.2.6 /home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output


- `test-log`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/latest/logs/test-test_2026-06-19T18-59-26-845Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/latest/logs/test-test_2026-06-19T18-59-26-845Z.log) — Full test log saved to: /home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/latest/logs/test-test_2026-06-19T18-59-26-845Z.log

## Medium Findings

_No medium severity findings._
## Low Findings

_No low severity findings._
## Agent Output Audit

**Completion Score:** [████░░░░░░] **39/100**

### Requested Capabilities

- ui-pages
- auth
- billing
- dashboard
- database

### Implemented Capabilities

- docs
- auth
- tests
- auth
- billing
- other
- integrations

### Missing Capabilities

- ui-pages
- dashboard
- database

### Fake / Shallow Implementations

_None detected._

## Evidence Index

### Logs

- [logs/build-build_2026-06-19T18-59-26-500Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/logs/build-build_2026-06-19T18-59-26-500Z.log) (0.4 KB)
- [logs/test-test_2026-06-19T18-59-26-845Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/logs/test-test_2026-06-19T18-59-26-845Z.log) (0.7 KB)
- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [AGENT_OUTPUT_AUDIT.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/AGENT_OUTPUT_AUDIT.json) (20.3 KB)
- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/TURPAN_FINDINGS.json) (5.2 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/TURPAN_SCORECARD.json) (0.2 KB)
- [agent-audit-summary.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/packages/analyzers/tests/fixtures/agent-output/.turpan/runs/2026-06-19T18-59-26-385Z/agent-audit-summary.json) (0.5 KB)
