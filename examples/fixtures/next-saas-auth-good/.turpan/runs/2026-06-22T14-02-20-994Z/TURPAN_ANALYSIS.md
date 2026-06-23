# Turpan Analysis

## Verdict

❌ **NO_GO**

## Executive Summary

- ❌ **NO_GO** — project has 1 critical findings that must be resolved before release
- Overall score: **91/100
- 🔴 1 critical finding requires immediate attention
- 🟠 1 high severity finding should be addressed before release
- 🟡 2 medium severity findings planned for next sprint
- Build health: **91/100**
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
| Report Version | 2026-06-22T14-02-20-994Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **91/100** |
| Build Health       | 91/100 |
| Test Health        | 95/100 |
| Code Quality       | 100/100 |
| Security           | 100/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 1 |
| 🟠 High     | 1 |
| 🟡 Medium   | 2 |
| 🟢 Low      | 0 |
| 🔵 Info     | 1 |

## Critical Findings


### Build script 'build' failed with exit code 127


The build command exited with a non-zero exit code. This typically means a compilation error, missing dependency, or configuration issue.

**Suggested Fix:**

Run the build manually to see full error: npm run build

**Evidence:**

- `build-failure`: 
> next-saas-auth-good@1.0.0 build
> next build


- `build-log`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/build-build_2026-06-22T14-02-21-121Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/build-build_2026-06-22T14-02-21-121Z.log) — Full build log saved to: /home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/build-build_2026-06-22T14-02-21-121Z.log

## High Findings


### TypeScript type errors found (exit code 2)


The TypeScript compiler reported type errors. These are real type safety issues that should be fixed.

**Suggested Fix:**

Fix type errors — run 'tsc --noEmit' for details

**Evidence:**

- `typecheck-output`: 
> next-saas-auth-good@1.0.0 typecheck
> tsc --noEmit

app/admin/page.tsx(1,25): error TS2307: Cannot find module 'next/headers' or its corresponding type declarations.
app/admin/page.tsx(2,26): error TS2307: Cannot find module 'next/navigation' or its corresponding type declarations.
app/admin/page.tsx(18,7): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(19,9): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(19,24): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(20,9): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(20,45): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(21,7): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(26,5): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(27,7): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(27,22): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(28,7): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(28,33): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(29,7): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/admin/page.tsx(30,9): error TS7026: JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
app/adm
…[truncated]
- `typecheck-log`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/typecheck-typecheck_2026-06-22T14-02-21-806Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/typecheck-typecheck_2026-06-22T14-02-21-806Z.log) — Full typecheck log: /home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/typecheck-typecheck_2026-06-22T14-02-21-806Z.log

## Medium Findings


### Missing test script in package.json


No `test` script was detected in package.json. The test stage will be skipped without a test command.

**Suggested Fix:**

Add a "test" script to package.json, e.g. "test": "vitest" or "test": "jest"

**Evidence:**

- `package.json`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/package.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/package.json) — {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit"
}

### Lint script 'lint' found issues (exit code 127)


The linter reported issues. Review the output for details — these are style, quality, or potential bug findings.

**Suggested Fix:**

Fix lint issues manually or run with auto-fix: npm run lint -- --fix

**Evidence:**

- `lint-output`: 
> next-saas-auth-good@1.0.0 lint
> next lint


- `lint-log`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/lint-lint_2026-06-22T14-02-21-893Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/lint-lint_2026-06-22T14-02-21-893Z.log) — Full lint log saved to: /home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/latest/logs/lint-lint_2026-06-22T14-02-21-893Z.log

## Low Findings

_No low severity findings._
## Evidence Index

### Logs

- [logs/build-build_2026-06-22T14-02-21-121Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/2026-06-22T14-02-20-994Z/logs/build-build_2026-06-22T14-02-21-121Z.log) (0.4 KB)
- [logs/lint-lint_2026-06-22T14-02-21-893Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/2026-06-22T14-02-20-994Z/logs/lint-lint_2026-06-22T14-02-21-893Z.log) (0.4 KB)
- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/2026-06-22T14-02-20-994Z/logs/turpan.log) (0.1 KB)
- [logs/typecheck-typecheck_2026-06-22T14-02-21-806Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/2026-06-22T14-02-20-994Z/logs/typecheck-typecheck_2026-06-22T14-02-21-806Z.log) (26.0 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/2026-06-22T14-02-20-994Z/TURPAN_FINDINGS.json) (9.2 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/next-saas-auth-good/.turpan/runs/2026-06-22T14-02-20-994Z/TURPAN_SCORECARD.json) (0.2 KB)
