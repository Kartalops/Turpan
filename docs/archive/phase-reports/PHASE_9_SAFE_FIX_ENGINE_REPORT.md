# Phase 9: Safe Fix Engine — Implementation Report

## Summary

Implemented the **Safe Fix Engine** (`@turpan/fix-engine`) — a finding-driven, minimal, reversible code fix system for Turpan. The engine wraps a review's findings, generates targeted patches for low-risk issues, validates them against the project's build/test/lint tooling, and rolls back automatically on failure.

**5 fix modes** are supported: `report-only` (default, no modifications), `patch-only` (generate diffs), `apply` (apply to working tree), `interactive` (confirm each fix), and `auto-safe` (auto-apply safe fixes only).

## Files Changed

| File | Change |
|------|--------|
| `packages/fix-engine/package.json` | New package |
| `packages/fix-engine/tsconfig.json` | New package |
| `packages/fix-engine/vitest.config.ts` | New package |
| `packages/fix-engine/src/types.ts` | All shared types |
| `packages/fix-engine/src/FixPolicy.ts` | Fix mode policies |
| `packages/fix-engine/src/SafeFixCatalog.ts` | 11 fix strategies mapped to finding types |
| `packages/fix-engine/src/FixCandidate.ts` | Candidate generation from findings |
| `packages/fix-engine/src/FixPlanner.ts` | Core workflow orchestration |
| `packages/fix-engine/src/PatchGenerator.ts` | Unified diff generation (LCS-based, no deps) |
| `packages/fix-engine/src/PatchApplier.ts` | File patching with git worktree support |
| `packages/fix-engine/src/PatchVerifier.ts` | Validation (build, typecheck, lint, test) |
| `packages/fix-engine/src/RollbackManager.ts` | Backup-based rollback |
| `packages/fix-engine/src/reportWriter.ts` | Report generation |
| `packages/fix-engine/src/index.ts` | Public API |
| `packages/fix-engine/tests/fix-engine.test.ts` | 46 unit tests |
| `apps/cli/src/commands/fix.ts` | CLI fix runner (interactive confirmation, git state check) |
| `apps/cli/src/commands/fixCommand.ts` | `turpan fix` CLI command |
| `apps/cli/src/commands/index.ts` | Export new command |
| `apps/cli/src/index.ts` | Register command, add `--fix/--patch-only/--apply/--interactive/--auto-safe` flags to review command, interactive shell fix handler |
| `apps/cli/package.json` | Added `@turpan/fix-engine` dependency |

## Architecture

```
FixPlanner.buildFixPlan()
  ├── loadFindings()
  ├── createFixCandidates()   → SafeFixCatalog.lookupStrategy()
  ├── filterByConfidence()
  └── policy routing (mode + category)
         │
         ▼
   PatchGenerator.generatePatch()
         │
         ▼
   PatchApplier.applyFixCandidates()   [git worktree or direct]
         │
         ▼
   PatchVerifier.verifyPatch()
         │                         (build, typecheck, lint, test)
         ▼
   shouldRollback()?
         │
    ┌────┴────┐
    │ yes     │ no
    ▼         ▼
RollbackManager.rollback()   writeFixReport()
                                 │
                                 ▼
                      TURPAN_FIX_PLAN.md
                      TURPAN_PATCH.diff
                      TURPAN_FIX_RESULT.json
```

## Fix Categories

### Safe (auto-apply in `auto-safe` mode)
1. **Remove unused imports** — `dead-code + unused-import` tag
2. **Remove console.log / debugger** — `maintainability + console-log/debug-code`
3. **Apply lint autofix** — `lint` category with `suggestedFix`
4. **Remove unused variable** — `dead-code + unused-variable` (compiler-confirmed)
5. **Add null guard** — `runtime` + severity ≤ medium + confidence ≥ 85
6. **Fix broken relative import** — `build + broken-import` tag + confidence ≥ 80

### Manual (requires confirmation)
- **Remove unused dependency** — `dependency + unused-dependency`
- **Delete unused file** — `dead-code + unused-file` (confidence ≥ 90, patch-only)
- **Replace placeholder TODO** — `maintainability + placeholder-todo` (confidence ≥ 85, obvious fix)
- **Suggest missing test script** — report only, no auto-modification

### Unsafe (never auto-apply)
- Rewriting auth, billing, database schema, external APIs, or business logic
- Running migrations, altering env secrets

## Fix Modes

| Mode | Behavior |
|------|----------|
| `report-only` | Default. Analyze and display what would be fixed — no modifications |
| `patch-only` | Generate `TURPAN_PATCH.diff` in `.turpan/fixes/<run-id>/` — no file changes |
| `apply` | Apply all non-unsafe fixes; rollback on blocking validation failure |
| `interactive` | Confirm each fix before applying; work even on dirty git tree |
| `auto-safe` | Auto-apply only `safe` category fixes; rollback on failure |

## Git Safety

- Detects dirty working tree and warns before applying
- Prefers git worktree (`.turpan/worktrees/<run-id>`) for apply mode
- Falls back to direct file patching with backup to `.turpan/backups/<run-id>/`
- Backup filenames encode original path for recovery: `{timestamp}_{random}_{escaped-path}`
- `requireCleanGitTree: true` enforced for `apply` and `auto-safe` modes

## Validation

PatchVerifier runs checks in order:
1. **Blocking** (block on failure → rollback): `build`, `typecheck`
2. **Non-blocking** (warn but don't rollback): `lint`, `test`

Only `build` and `typecheck` failures trigger rollback. `lint` and `test` failures are reported but do not undo the patch.

## Validation Results

| Check | Command |
|-------|---------|
| `npm run build` | Build script |
| `tsc --noEmit` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run test` | Test script |

All commands are auto-detected from `package.json` scripts and fall back to project-native tools (Make, pytest, etc.).

## CLI Commands

```bash
# Standalone fix (uses findings from latest review run)
turpan fix . --patch-only          # generate diff, don't apply
turpan fix . --apply              # apply to working tree
turpan fix . --interactive        # confirm each fix
turpan fix . --auto-safe          # auto-apply only safe fixes
turpan fix . --review --deep      # run review first, then fix

# Review command with fix flags
turpan review . --fix             # same as --patch-only
turpan review . --patch-only
turpan review . --apply
turpan review . --interactive
turpan review . --auto-safe

# Interactive shell
turpan
  > fix safe issues
  > improve code quality safely
  > remove unused code safely
  > apply only low-risk fixes
  > generate patch but do not apply
```

## Output Files

Each fix run writes three files under `.turpan/fixes/<run-id>/`:

| File | Contents |
|------|----------|
| `TURPAN_FIX_PLAN.md` | Fix plan with applied/rejected/deferred candidates, policy applied |
| `TURPAN_PATCH.diff` | Unified diff of all changes, with Turpan header |
| `TURPAN_FIX_RESULT.json` | Full structured result (candidates, validation, rollback) |

## Test Coverage

**46 unit tests** covering:
- FixPolicy: `policyForMode`, `isAutoApplicable`, `isModeAllowed`, `requiresConfirmation`, `validatePolicy`, `mergePolicy`
- SafeFixCatalog: strategy lookup, `isFixable`, `filterFixable`
- FixCandidate: creation, filtering, aggregation
- FixPlanner: mode routing, confidence threshold, plan generation
- PatchGenerator: diff format, empty candidates, patch header
- PatchVerifier: `shouldRollback` logic (blocking vs non-blocking)
- RollbackManager: backup filename parsing, backup dir path
- ReportWriter: markdown rendering

## Key Design Decisions

1. **No external diff library** — built a simple LCS-based line diff in `PatchGenerator.ts` to keep the package dependency-free.

2. **`manual` category deferred, not blocked** — in `auto-safe` mode, `manual` fixes require confirmation but are not rejected outright. This allows `turpan fix . --auto-safe` to auto-fix safe issues while still presenting manual ones for interactive review.

3. **`report-only` blocks nothing** — the policy for `report-only` mode has empty `blockedCategories`. The planner's switch case routes all candidates to `applied` for display. The actual "no modifications" guarantee comes from the `dryRun: true` flag in `applyFixCandidates`.

4. **Rollback is backup-based** — git worktree removal is preferred, but when not available (non-git repo), files are restored from `.turpan/backups/<runId>/` using the encoded filename → path mapping.

5. **Random component in runId** — `fix-{timestamp}-{random4}` prevents runId collisions in parallel vitest workers and concurrent runs.

## Final Verdict

READY — all 46 tests pass, CLI commands verified, build clean.
