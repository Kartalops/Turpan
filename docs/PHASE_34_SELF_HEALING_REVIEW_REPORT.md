# Phase 34 Self-Healing Review Report

## Scope

Phase 34 introduces evidence-driven autonomous repair primitives. The implementation does not make "AI edits code" the default behavior. It creates a controlled patch experiment system whose purpose is to prove that a minimal patch fixes a verified finding in isolation.

The active working tree remains read-only by default through `applyMode: "never"`.

## What Was Added

- Fix eligibility classification:
  - `AUTO_FIXABLE`
  - `PATCH_PROPOSAL_ONLY`
  - `HUMAN_REQUIRED`
  - `NOT_FIXABLE`
- Minimal patch budgets:
  - maximum files changed
  - maximum lines changed
  - maximum dependency changes
- Isolated patch experiment contracts:
  - immutable experiment IDs
  - temporary git worktree creation
  - patch application inside the worktree
  - validation inside the worktree
  - reproduction before/after capture
  - mandatory worktree cleanup
- Impacted test selection:
  - syntax/parser checks
  - package typecheck
  - sibling unit tests
  - dynamic reproduction checks
- Regression test guardrails:
  - rejects missing tests
  - rejects missing assertions
  - rejects skipped tests
  - rejects always-true assertions
  - rejects swallowed exceptions
  - flags tests that appear to mock away the implementation under test
- Adversarial patch review:
  - dependency additions
  - public API changes
  - error swallowing
  - excessive patch complexity
- Multiple patch candidate scoring:
  - reproduction success
  - validation success
  - verifier concerns
  - patch size
  - changed file count
- Patch evidence reports:
  - problem
  - evidence before
  - root cause
  - patch
  - files changed
  - selected tests
  - reproduction before/after
  - adversarial review
  - residual risks
  - confidence

## Runtime Flow

1. A verified finding is classified for fix eligibility.
2. Patch candidates are checked against minimal patch budgets.
3. A temporary git worktree is created for the experiment.
4. The patch and optional regression test diff are applied only inside that worktree.
5. Impacted tests are selected from changed files and reproduction checks.
6. Dynamic reproduction checks are executed before and after patch application.
7. Syntax/type/unit/reproduction checks run through the validation ladder.
8. The adversarial patch reviewer attempts to reject the patch.
9. Accepted candidates are scored by evidence and patch size.
10. The smallest proven patch is selected.
11. The temporary worktree is destroyed in `finally`, including failure paths.
12. A patch evidence report is produced without applying changes to the user's active tree.

## Default Safety Policy

```text
applyMode: never
maxFilesChanged: 3
maxLinesChanged: 80
maxDependencyChanges: 0
maxCandidates: 3
maxParallelExperiments: 2
requireRegressionTest: true
requireReproductionFlip: true
```

Autonomous working-tree mutation is not silently enabled. Applying an accepted patch to the user's active tree remains an explicit higher-level decision.

## Reproduction Flip

The new experiment model records `ReproductionFlip` objects:

```text
before patch: FAIL
after patch: PASS
```

If a finding has dynamic reproduction checks and the policy requires reproduction flip, the experiment is rejected unless every reproduction flips.

## Validation

Commands run:

```text
./node_modules/.bin/tsc -p packages/fix-engine/tsconfig.json --noEmit
./node_modules/.bin/vitest run packages/fix-engine/tests/self-healing.test.ts
./node_modules/.bin/vitest run packages/fix-engine/tests/fix-engine.test.ts packages/fix-engine/tests/self-healing.test.ts
./node_modules/.bin/vitest run packages/fix-engine/tests/fix-engine.test.ts packages/fix-engine/tests/self-healing.test.ts packages/core/tests/runtime-exploration.test.ts packages/core/tests/intelligence.test.ts packages/core/tests/architecture-reset.test.ts packages/core/tests/runner.test.ts packages/shared/src/fs/fs.test.ts packages/report/tests/report.test.ts apps/mcp-server/tests/redact.test.ts
npm run lint -- --max-warnings=0
npm run build
```

Results:

- Fix-engine typecheck passed.
- Phase 34 self-healing tests passed: 9 tests.
- Fix-engine regression suite passed: 2 files, 55 tests.
- Targeted Phase 31-34 regression suite passed: 9 files, 238 tests.
- `npm run lint -- --max-warnings=0` and `npm run build` could not run because the repository scripts delegate to `pnpm`, and `pnpm` was not installed in this environment.

## Known Limits

- Patch generation itself is still supplied by existing fix-engine/model layers; this phase implements the evidence-driven experiment, scoring, safety, and reporting foundation.
- Real patch application uses git worktrees, but unit tests use a fake worktree manager to avoid mutating the repository.
- Broader repository lint/build still depends on `pnpm` being installed in the environment.
