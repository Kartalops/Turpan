# Next Architecture Audit

Date: August 15, 2026

## Scope

This audit maps the current Turpan workspace as it exists after the Phase 31 reset work in this branch. Every conclusion below is tied to code that was inspected directly.

Primary reference points:

- `packages/core/src/orchestrator/index.ts:7-20`
- `packages/core/src/orchestrator/index.ts:189-257`
- `packages/core/src/orchestrator/ReviewOrchestrator.ts:82-98`
- `packages/core/src/runner/SafeCommandRunner.ts:81-120`
- `packages/report/src/runArtifacts.ts:53-100`
- `packages/core/src/protocol/index.ts:5-111`
- `apps/cli/src/index.ts`
- `apps/mcp-server/src/tools/review.ts`

## Current Package Graph

Workspace package count: `11`

Apps:

- `apps/cli`
  Responsibility: human-facing CLI, shell UX, terminal rendering, command routing.
  Direct workspace deps: `@turpan/analyzers`, `@turpan/core`, `@turpan/dependency-audit`, `@turpan/fix-engine`, `@turpan/git-diff`, `@turpan/mcp-server`, `@turpan/report`, `@turpan/shared`, `@turpan/ui-runner`.
  Architectural note: this is too wide for a thin adapter and even depends on another app package.

- `apps/mcp-server`
  Responsibility: MCP adapter, schemas, workspace validation, audit logging, tool exposure.
  Direct workspace deps: `@turpan/analyzers`, `@turpan/core`, `@turpan/fix-engine`, `@turpan/report`, `@turpan/shared`, `@turpan/ui-runner`.

Packages:

- `packages/core`
  Responsibility: orchestration, findings, project fingerprinting, plugins, runner stages, legacy report writer.
  Direct workspace deps: `@turpan/dependency-audit`, `@turpan/diff-analyzers`, `@turpan/git-diff`, `@turpan/shared`.
  Inbound deps: `apps/cli`, `apps/mcp-server`, `packages/analyzers`, `packages/fix-engine`, `packages/report`, `packages/ui-runner`.

- `packages/shared`
  Responsibility: low-level shared types plus filesystem/git helpers.
  Direct workspace deps: none.
  Inbound deps: `apps/cli`, `apps/mcp-server`, `packages/core`, `packages/dependency-audit`, `packages/diff-analyzers`, `packages/fix-engine`, `packages/report`, `packages/ui-runner`.
  Architectural note: this is the broadest fan-in package and remains an overgrown grab-bag boundary.

- `packages/report`
  Responsibility: markdown/html/json/scorecard/report bundle generation plus run-artifact loading helpers.
  Direct workspace deps: `@turpan/core`, `@turpan/shared`, `@turpan/fix-engine`.
  Inbound deps: `apps/cli`, `apps/mcp-server`.

- `packages/ui-runner`
  Responsibility: Playwright-driven UI/runtime evidence gathering, screenshots, scenarios.
  Direct workspace deps: `@turpan/core`, `@turpan/shared`.
  Inbound deps: `apps/cli`, `apps/mcp-server`.

- `packages/fix-engine`
  Responsibility: patch planning, applying, rollback, verification.
  Direct workspace deps: `@turpan/shared`, `@turpan/core`.
  Inbound deps: `apps/cli`, `apps/mcp-server`, `packages/report`.

- `packages/diff-analyzers`
  Responsibility: diff-only security/correctness/test-coverage analyzers.
  Direct workspace deps: `@turpan/git-diff`, `@turpan/shared`.
  Inbound deps: `packages/core`.

- `packages/git-diff`
  Responsibility: git diff extraction and normalization.
  Direct workspace deps: `@turpan/shared`.
  Inbound deps: `apps/cli`, `packages/core`, `packages/diff-analyzers`.

- `packages/dependency-audit`
  Responsibility: SBOM, offline/online dependency and license audit.
  Direct workspace deps: `@turpan/shared`.
  Inbound deps: `apps/cli`, `packages/core`.

- `packages/analyzers`
  Responsibility: agent-output audit.
  Direct workspace deps: `@turpan/core`.
  Inbound deps: `apps/cli`, `apps/mcp-server`.

## Current Data Flow

The current review path is still disk-and-artifact centric rather than protocol centric.

1. CLI or MCP input is translated into `OrchestratorOptions`.
   References:
   - `apps/cli/src/index.ts`
   - `apps/mcp-server/src/tools/review.ts:36-129`

2. `runAnalysis()` loads config, creates a run directory, fingerprints the repo, and calls `runReview()`.
   References:
   - `packages/core/src/orchestrator/index.ts:189-257`

3. `runReview()` builds a plan, constructs `ReviewContext`, executes stage functions, accumulates findings in `FindingStore`, and computes a scorecard/verdict.
   References:
   - `packages/core/src/orchestrator/ReviewOrchestrator.ts:103-260`

4. Stage implementations call `SafeCommandRunner` or other subsystem-specific execution paths.
   Reference:
   - `packages/core/src/runner/SafeCommandRunner.ts:81-120`

5. Core still writes legacy run artifacts through `packages/core/src/reports/index.ts`, then adapters or helpers re-read artifacts from disk.
   References:
   - `packages/core/src/orchestrator/index.ts:379-389`
   - `packages/core/src/reports/index.ts`
   - `packages/report/src/runArtifacts.ts:53-100`

6. Adapters and report writers read `TURPAN_FINDINGS.json` and `TURPAN_SCORECARD.json` back from disk to build UX responses.
   References:
   - `apps/cli/src/index.ts`
   - `apps/mcp-server/src/tools/review.ts`
   - `packages/report/src/runArtifacts.ts:53-100`

## Current Review Flow

The active review pipeline is directional but still carries historical layers:

1. `packages/core/src/orchestrator/index.ts` is the legacy CLI-oriented wrapper around the newer orchestrator.
2. `packages/core/src/orchestrator/ReviewOrchestrator.ts` is the true execution engine.
3. `STAGE_REGISTRY` maps stage ids to actual implementations.
4. `SafeCommandRunner` enforces execution policy for many, but not all, subprocess flows.
5. The report boundary is split:
   - legacy core report writing in `packages/core/src/reports/index.ts`
   - richer rendering in `packages/report/src/*`

This split is the largest remaining historical boundary with no strong product justification.

## Duplicated Responsibilities

### Execution semantics

- Canonical runner: `packages/core/src/runner/SafeCommandRunner.ts:81-120`
- Still-separate execution paths:
  - `packages/ui-runner/src/AppServerManager.ts`
  - `packages/fix-engine/src/PatchApplier.ts`
  - `packages/fix-engine/src/PatchVerifier.ts`
  - `packages/fix-engine/src/RollbackManager.ts`
  - `packages/dependency-audit/src/onlineScanner.ts`

Assessment:

- Timeout, cancellation, output capture, redaction, cwd restriction and audit semantics are still not uniformly enforced across the repo.
- Phase 31 removed one dead parallel API (`packages/shared/src/process/index.ts`) but did not yet collapse every live subprocess caller onto the same primitive.

### Run artifact loading

- Before this change, CLI and MCP each implemented their own `loadLatestRunArtifacts()` and severity summary logic.
- The new shared implementation now lives in `packages/report/src/runArtifacts.ts:53-100`.
- Remaining disk-first artifact pattern still exists in both adapters.

### Report generation

- Legacy report writer: `packages/core/src/reports/index.ts`
- Rich report package: `packages/report/src/*`

Assessment:

- This is still duplicated report infrastructure.
- `core` should emit structured `ReviewRun` data; `report` should be the only renderer.

### Protocol and finding shapes

- Existing runtime/public shape: `packages/shared/src/types/index.ts`
- Core finding shape: `packages/core/src/findings/Finding.ts`
- New minimal contracts: `packages/core/src/protocol/index.ts`

Assessment:

- There are still parallel type systems.
- The new protocol file is a stabilization point, not a full replacement yet.

### Filesystem helper spread

- Shared helpers: `packages/shared/src/fs/index.ts:4-50`
- Local copies still exist, especially in:
  - `packages/core/src/orchestrator/index.ts:22-26`
  - `packages/core/src/reports/index.ts:7-11`
  - `packages/fix-engine/src/reportWriter.ts`

## Dead Code / Delete Candidates

Deleted in this branch:

- `packages/shared/src/process/index.ts`
  Reason: completely unused parallel execution API; it duplicated `SafeCommandRunner` without policy, redaction, or audit semantics.

Still present and strong delete candidates:

- `packages/core/src/reports/index.ts`
  Reason: historical report writer duplicated by `packages/report`.

- `apps/cli` -> `@turpan/mcp-server` dependency
  Reason: app-to-app dependency expands adapter coupling.

- Local helper copies such as `ensureRunBaseDir()` in `packages/core/src/orchestrator/index.ts:22-26`
  Reason: trivial infrastructure duplicated from shared helpers.

## Merge Candidates

- Merge run-artifact reading into `report`
  Status: partially done in this branch via `packages/report/src/runArtifacts.ts`.

- Merge protocol ownership into `core`
  Status: started via `packages/core/src/protocol/index.ts`.

- Merge all subprocess execution semantics behind a single execution package inside `core`
  Status: not complete.

- Merge legacy `core/reports` into `report`
  Status: not started due current package dependency direction; this will require `core` to stop rendering reports directly.

## Keep Candidates

- `packages/core/src/orchestrator/ReviewOrchestrator.ts`
  Reason: already provides the correct directional center.

- `packages/core/src/runner/SafeCommandRunner.ts`
  Reason: closest existing implementation to the required execution primitive.

- `packages/diff-analyzers`
  Reason: diff-scoped review quality is product-critical and already directionally isolated from adapters.

- `packages/ui-runner`
  Reason: browser automation and screenshot evidence are large enough to justify a subsystem boundary.

## Rewrite Candidates

- `packages/core/src/orchestrator/index.ts`
  Reason: legacy wrapper mixes run directory setup, dependency audit translation, report writing, doctor logic and orchestration.

- `packages/shared`
  Reason: current boundary is too wide; most survivors should be split into protocol/fs/git or folded into `core`.

- `apps/cli/src/index.ts`
  Reason: still a thick adapter with report generation, doctor checks, fix/report glue, and shell bootstrapping.

- `apps/mcp-server/src/tools/review.ts`
  Reason: still holds review/fix/report orchestration logic instead of staying a request adapter.

## Unused Exports / Test-Only Leakage

Observed in this branch:

- `packages/shared/src/fs/index.ts` had several helpers only exercised by tests. Phase 31 removed `listDirectory`, `isDirectory`, `isFile`, and `getTurpanConfigPath`.
- `packages/core/src/context/index.ts` exported `createEmptyFindings()` with no production callers. Phase 31 removed it.

## Recommended Target Shape

Do not move packages blindly yet. The smallest credible next-step architecture is:

- `apps/cli`
- `apps/mcp-server`
- `packages/core`
  Contains protocol, orchestration, execution, findings, fingerprinting.
- `packages/report`
  Pure renderer and artifact reader.
- `packages/ui-runner`
  Browser/runtime evidence worker.
- `packages/fix-engine`
  Patch planning and verification.
- `packages/diff-analyzers`
  Diff-specialized rule pack.
- `packages/dependency-audit`
  Dependency-only subsystem.

Strong follow-up fold candidates:

- Fold `packages/shared` into `core` and subsystem-local utility modules.
- Consider folding `packages/git-diff` into `core` once adapter and diff-stage seams are stable.

## Verified Constraints After This Branch

- No workspace package -> app dependency edges from packages are allowed by the new architecture test.
  Reference:
  - `packages/core/tests/architecture-reset.test.ts:31-46`

- No circular workspace package dependencies.
  Reference:
  - `packages/core/tests/architecture-reset.test.ts:48-66`

- Adapters must not construct findings directly.
  Reference:
  - `packages/core/tests/architecture-reset.test.ts:68-79`
