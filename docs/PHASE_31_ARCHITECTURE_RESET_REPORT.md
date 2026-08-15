# Phase 31 Architecture Reset Report

Date: August 15, 2026

## Outcome

Phase 31 made real simplification progress, but it did not satisfy every stated exit criterion.

What is complete in this branch:

- repository forensics were documented
- duplicated run-artifact loading was consolidated
- one dead execution layer was deleted
- dead helper exports were removed
- minimal serializable core contracts were introduced
- deterministic finding IDs were added
- architecture guardrail tests were added

What remains incomplete:

- full workspace install/lint/build/test/eval verification
- full consolidation onto one execution primitive
- elimination of the `core/reports` vs `report` split
- package-count reduction
- CLI/MCP thinning to the level implied by the target architecture

## Implemented Changes

### 1. Minimal core contracts

Added `packages/core/src/protocol/index.ts`.

This creates a stable low-ceremony contract surface for the next-generation agent runtime:

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

### 2. Single shared run-artifact reader

Added `packages/report/src/runArtifacts.ts`.

This replaced duplicated adapter logic and gives both CLI and MCP one shared way to read:

- `TURPAN_FINDINGS.json`
- `TURPAN_SCORECARD.json`
- latest run symlink/dir
- severity summaries

### 3. Deterministic finding identity

Updated `packages/core/src/findings/Finding.ts` so default finding IDs are now stable hashes of evidence-backed finding content rather than timestamp-based ids.

### 4. Architecture tests

Added `packages/core/tests/architecture-reset.test.ts`.

These tests now enforce:

- no package -> app dependency direction
- no workspace cycles
- adapter thinness guardrails
- serializable review protocol
- deterministic finding IDs

## What We Deleted And Why

- `packages/shared/src/process/index.ts`
  Deleted because it was a dead parallel execution abstraction with weaker safety semantics than `SafeCommandRunner`.

- `packages/shared/src/fs/index.ts`
  Deleted helpers:
  - `listDirectory`
  - `isDirectory`
  - `isFile`
  - `getTurpanConfigPath`
  Reason: no production callers; they only inflated shared surface area.

- `packages/core/src/context/index.ts`
  Deleted `createEmptyFindings()`
  Reason: dead export.

- Local duplicated adapter logic
  Deleted duplicated artifact-loading and severity-summary implementations from:
  - `apps/cli/src/index.ts`
  - `apps/mcp-server/src/tools/review.ts`
  Reason: replaced by `packages/report/src/runArtifacts.ts`

## Verification

Passed:

- targeted Vitest run: `161` tests passed on August 15, 2026
- package-local `tsc --noEmit`:
  - `packages/shared`
  - `packages/core`

Blocked:

- `pnpm`-driven install/build/lint/test/eval commands
  Reason:
  - `pnpm` missing from PATH
  - `corepack pnpm` required network access and failed because `registry.npmjs.org` was unreachable in this environment on August 15, 2026

- full workspace TypeScript project-reference validation
  Reason:
  - existing reference configuration errors, such as referenced projects lacking `composite`

## Architectural Readiness

The repo is in a better position to host an agent runtime than it was before this branch because:

- there is now an explicit protocol surface
- adapter duplication was reduced
- the directionality of workspace dependencies is now tested
- finding serialization is more stable

But the next phase should not assume the reset is finished. The highest-value remaining steps are:

1. stop `core` from rendering reports directly
2. collapse more subprocess callers onto one execution layer
3. remove the app-to-app dependency from `apps/cli` to `apps/mcp-server`
4. shrink or eliminate `packages/shared`
