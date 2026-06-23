# Turpan Analysis

## Verdict

❌ **NO_GO**

## Executive Summary

- ❌ **NO_GO** — project has 2 critical findings that must be resolved before release
- Overall score: **90/100
- 🔴 2 critical findings require immediate attention
- 🟠 1 high severity finding should be addressed before release
- 🟡 1 medium severity finding planned for next sprint
- Build health: **90/100**
- Security posture: **80/100**
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
| Report Version | 2026-06-20T10-07-31-901Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **90/100** |
| Build Health       | 90/100 |
| Test Health        | 95/100 |
| Code Quality       | 100/100 |
| Security           | 80/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 2 |
| 🟠 High     | 1 |
| 🟡 Medium   | 1 |
| 🟢 Low      | 2 |
| 🔵 Info     | 0 |

## Critical Findings


### MCP server allows arbitrary shell execution: child_process with shell in src/server.ts

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/src/server.ts`

The MCP server in "src/server.ts" executes shell commands. MCP servers with shell access can be exploited to run arbitrary commands on the host if any tool input is user-controlled. This is a CRITICAL security risk.

**Suggested Fix:**

Remove shell execution from MCP tools. If shell access is required, validate input against an explicit allowlist and use parameterized commands (no shell=True). Consider if a native API call can replace the shell command.

**Evidence:**

- `pattern`: child_process with shell

### MCP server allows arbitrary shell execution: child_process with shell in src/server.ts

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/src/server.ts`

The MCP server in "src/server.ts" executes shell commands. MCP servers with shell access can be exploited to run arbitrary commands on the host if any tool input is user-controlled. This is a CRITICAL security risk.

**Suggested Fix:**

Remove shell execution from MCP tools. If shell access is required, validate input against an explicit allowlist and use parameterized commands (no shell=True). Consider if a native API call can replace the shell command.

**Evidence:**

- `pattern`: child_process with shell

## High Findings


### Dependencies not installed — install required before review


The node_modules directory is missing. Turpan cannot run build, test, lint, or typecheck without first installing dependencies. Run your package manager install command before re-running the review, or pass the --install flag to have Turpan install automatically (if configured).

**Suggested Fix:**

Run: npm install

**Evidence:**

- `Missing node_modules`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/node_modules](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/node_modules) — Directory not found — node_modules is missing

## Medium Findings


### Missing test script in package.json


No `test` script was detected in package.json. The test stage will be skipped without a test command.

**Suggested Fix:**

Add a "test" script to package.json, e.g. "test": "vitest" or "test": "jest"

**Evidence:**

- `package.json`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/package.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/package.json) — {
  "build": "tsc",
  "start": "node dist/index.js"
}

## Low Findings


### MCP tool has overly broad schema: unconstrained object schema in src/server.ts

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/src/server.ts`

The MCP tool in "src/server.ts" has an input schema with unconstrained object schema. This provides no guidance to LLM clients about valid inputs, leading to malformed requests and runtime errors.

**Suggested Fix:**

Define precise JSON Schema types for all tool inputs: specify required fields, property types (string/number/boolean), string formats (e.g., format: 'uri'), and enum constraints where applicable.

**Evidence:**

- `pattern`: unconstrained object schema

### MCP tool has overly broad schema: unconstrained object schema in src/server.ts

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/src/server.ts`

The MCP tool in "src/server.ts" has an input schema with unconstrained object schema. This provides no guidance to LLM clients about valid inputs, leading to malformed requests and runtime errors.

**Suggested Fix:**

Define precise JSON Schema types for all tool inputs: specify required fields, property types (string/number/boolean), string formats (e.g., format: 'uri'), and enum constraints where applicable.

**Evidence:**

- `pattern`: unconstrained object schema

## Evidence Index

### Logs

- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/.turpan/runs/2026-06-20T10-07-31-901Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/.turpan/runs/2026-06-20T10-07-31-901Z/TURPAN_FINDINGS.json) (7.8 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/mcp-unsafe-tool/.turpan/runs/2026-06-20T10-07-31-901Z/TURPAN_SCORECARD.json) (0.2 KB)
