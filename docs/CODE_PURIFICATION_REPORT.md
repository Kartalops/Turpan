# Code Purification Report

Date: August 15, 2026

Principle applied: `delete > simplify > reuse > abstract > add`

## Measured Scope

Measurement basis:

- Source files only: `apps/*/src` and `packages/*/src`
- Excludes `dist`, `node_modules`, fixtures, generated output

Before:

- LOC: `47,576`
- Files: `253`
- Workspace packages/apps: `11`

After:

- LOC: `47,673`
- Files: `254`
- Workspace packages/apps: `11`

Interpretation:

- Net source LOC increased by `97`.
- Net source file count increased by `1`.
- This branch still reduced conceptual surface area because it deleted one dead execution layer and several dead helpers, while adding:
  - minimal review protocol contracts
  - architecture guardrail tests
  - one shared run-artifact loader

## What Changed

### Abstractions removed

- Removed `packages/shared/src/process/index.ts`
  Why: unused, duplicated command execution without policy/redaction/audit.

- Removed dead filesystem helpers from `packages/shared/src/fs/index.ts`
  Removed: `listDirectory`, `isDirectory`, `isFile`, `getTurpanConfigPath`
  Why: zero production callers.

- Removed `createEmptyFindings()` from `packages/core/src/context/index.ts`
  Why: dead export.

### Duplicated code removed

- Consolidated duplicated run-artifact loading and severity summarization from:
  - `apps/cli/src/index.ts`
  - `apps/mcp-server/src/tools/review.ts`
  into:
  - `packages/report/src/runArtifacts.ts`

- Replaced local path-resolution copies in:
  - `apps/cli/src/index.ts`
  - `apps/cli/src/commands/eval.ts`
  with the shared helper in:
  - `packages/shared/src/fs/index.ts:4-15`

### Core contracts added

- Added minimal serializable protocol in `packages/core/src/protocol/index.ts`
  Key types:
  - `ReviewRequest`
  - `ReviewRun`
  - `ReviewTask`
  - `ToolCall`
  - `Artifact`
  - `FindingCandidate`
  - `VerificationResult`
  - `ModelRequest`
  - `ModelResponse`
  - `ReviewVerdict`

### Deterministic finding IDs

- `packages/core/src/findings/Finding.ts:70-115`
  Change:
  - default finding IDs now derive from stable finding content rather than `Date.now()` counters.
  Benefit:
  - stable serialization
  - repeatable snapshots
  - architecture tests can now enforce deterministic IDs

## Complexity Changes

Improved:

- Command execution surface reduced from two layers to one canonical layer plus remaining specialist callers.
- Artifact loading logic reduced from two adapter-local implementations to one shared implementation.
- Adapter logic became slightly thinner.

Still outstanding:

- `packages/core/src/reports/index.ts` vs `packages/report/src/*`
- `packages/shared` remains too broad
- subprocess execution is still not fully collapsed onto `SafeCommandRunner`
- `apps/cli` still depends on nearly the entire workspace, including another app package

## Test Changes

Added:

- `packages/core/tests/architecture-reset.test.ts`
  Verifies:
  - forbidden dependency directions
  - no circular workspace package dependencies
  - CLI/MCP thinness guardrails
  - serializable review protocol
  - deterministic finding IDs

Updated:

- `packages/shared/src/fs/fs.test.ts`
  Adjusted for helper deletions and new real implementations for `ensureDir()` and `writeJsonFile()`

## Verification Performed

Passed on August 15, 2026:

- Targeted source tests: `161` tests passed
  Included:
  - `packages/core/tests/architecture-reset.test.ts`
  - `packages/core/tests/runner.test.ts`
  - `packages/shared/src/fs/fs.test.ts`
  - `packages/report/tests/report.test.ts`
  - `apps/mcp-server/tests/redact.test.ts`

- Package-local typecheck succeeded:
  - `packages/shared`
  - `packages/core`

Could not complete in this environment:

- `pnpm install`, `pnpm lint`, `pnpm build`, full workspace `pnpm test`, evals, CLI smoke, MCP smoke
  Reason:
  - `pnpm` is not available on PATH.
  - `corepack pnpm` attempted a network fetch and failed due DNS/network restrictions on August 15, 2026.

- Full workspace TypeScript project-reference validation
  Reason:
  - existing repo-level `tsconfig` reference issues unrelated to this branch, e.g. missing `composite` on referenced projects.

## Summary

This purification pass reduced duplicated infrastructure and deleted dead code, but it did not yet shrink workspace package count or eliminate the core/report split. The branch improves the correctness of future cleanup by introducing shared artifact loading, deterministic finding IDs, and architecture tests that pin dependency direction.
