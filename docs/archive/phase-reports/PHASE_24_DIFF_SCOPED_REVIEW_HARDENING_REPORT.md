# Phase 24 — Diff-Scoped Review Hardening Report

## Summary

Implemented Phase 24: Diff-Scoped Security, Correctness & Test Coverage Review for Turpan. The system now deeply analyzes git diff hunks for introduced risks, correctness issues, and test coverage gaps — not just surface-level file statistics.

---

## What Was Built

### 1. `@turpan/diff-analyzers` Package

New workspace package at `packages/diff-analyzers/`.

**8 Security Analyzers:**

| Analyzer | Detects | Severity |
|----------|---------|----------|
| `HardcodedSecretAnalyzer` | API keys, AWS keys, passwords, tokens, generic secrets in added lines | CRITICAL |
| `AuthGuardAnalyzer` | Auth guard bypass, `skipAuth`, `noAuth`, `bypass`, `PUBLIC` flags, middleware removal | CRITICAL/HIGH |
| `AdminRouteAnalyzer` | Admin/dashboard/management routes added without auth checks | HIGH |
| `CorsAnalyzer` | CORS wildcard (`origin: '*'`) introduction | HIGH (API) / MEDIUM (static) |
| `SqlInjectionAnalyzer` | Template literal or concatenated SQL with user input | HIGH |
| `XssAnalyzer` | `dangerouslySetInnerHTML`, `.innerHTML=`, eval sinks | HIGH |
| `UnsafeExecutionAnalyzer` | `eval`, `exec`, `spawn`, `child_process` with req/query/params | CRITICAL |
| `UnsafeMcpToolAnalyzer` | `dangerouslyAllow*`, `file://`, `fs:'*'`, `shell:true` in MCP tools | CRITICAL/HIGH |

**6 Correctness Analyzers:**

| Analyzer | Detects |
|----------|---------|
| `ApiContractAnalyzer` | API route changes without client/usage updates |
| `FunctionSignatureAnalyzer` | Exported function signature changes without caller updates |
| `SchemaMigrationAnalyzer` | Schema/model changes without migration evidence |
| `EnvConfigAnalyzer` | New env vars without `.env.example` update |
| `DependencyAnalyzer` | `package.json` changes without lockfile update |
| `RouteUiEvidenceAnalyzer` | Route changes without test/screenshot evidence |

**4 Test Coverage Analyzers:**

| Analyzer | Detects |
|----------|---------|
| `MissingTestDetector` | Source files changed without corresponding test files |
| `TestDeletionAnalyzer` | Test files deleted |
| `NoAssertionTestAnalyzer` | Tests with no assertion statements |
| `CriticalFeatureCoverageAnalyzer` | Auth/billing/admin changes without test coverage |

All analyzers run in parallel via `Promise.all` and deduplicate findings by `id`.

### 2. PR Decision Engine Upgrade (`computeDiffRecommendation`)

Upgraded in `packages/git-diff/src/GitDiffEngine.ts`:

```
block_merge     → critical introduced findings OR critical diff risk
request_changes  → high introduced OR risky feature without tests OR medium risk + no test coverage
approve         → no critical/high AND (tests pass OR no risky feature changes)
```

Confidence thresholds:
- `high`: < 30 files, no refError
- `medium`: 30–100 files
- `low`: refError present OR > 100 files

### 3. Report Upgrades

**`TURPAN_PR_COMMENT.md`** gains:
- Merge decision banner (red/yellow for block/request-changes)
- Changed components section
- Top 5 introduced risks with severity icons
- Test coverage status table (auth/billing/admin, feature tests, deleted tests)
- Reproduction commands (`turpan review --from main --to HEAD --deep`)

**`TURPAN_DIFF_FINDINGS.json`** gains:
- `introducedFindings` — filtered to diff-scoped findings
- `preExistingFindings` — non-diff findings
- `testCoverage` — full coverage assessment
- `mergeDecision` — blockers, warnings, mustFix, niceToFix
- `changedSurface.ownership` — per-file ownership

**`DiffReview` type** in `packages/report/src/types.ts` extended with:
- `changedComponents: string[]`
- `topIntroducedRisks[]`
- `testCoverage{}`
- `mergeDecision{}`

### 4. CLI Type Fixes

`apps/cli/src/index.ts` — `DiffReview` type properly propagated through `printTerminalSummary` and `generateReports` with all new required fields.

### 5. Orchestrator Integration

`packages/core/src/runner/stages/diffScopedStage.ts` — new stage that runs all three analyzer groups in parallel, converts findings to core `Finding` type (security→security, test-coverage→test, correctness→architecture/api-design).

Stage registered in `ReviewOrchestrator` and `STAGE_REGISTRY`, called in diff-mode after install-check.

---

## New Fixtures

8 synthetic diff fixtures in `packages/diff-analyzers/tests/fixtures/`:

| Fixture | Purpose |
|---------|---------|
| `diff-introduces-secret` | Hardcoded AWS key, Stripe key, password in new file |
| `diff-removes-auth-guard` | Auth middleware removed + `skipAuth` bypass comment |
| `diff-adds-admin-route-no-auth` | New `/api/admin/users` route without auth |
| `diff-changes-api-contract-no-client-update` | API GET→POST breaking change, unrelated component changed |
| `diff-feature-no-tests` | 5 billing feature files, no test files |
| `diff-test-deletion` | `auth.test.ts` deleted, `auth.ts` modified |
| `diff-docs-only-clean` | README + docs only, no source changes |
| `diff-huge-low-confidence` | 120 files, should complete without crash |

---

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Build | `pnpm build` | ✅ All packages built |
| TypeScript | `tsc --noEmit` (DTS) | ✅ No type errors |
| Unit tests | `pnpm test` | ✅ 27/27 diff-analyzers pass; 11/11 git-diff pass; 301/302 core pass (1 pre-existing runner env failure) |
| Eval | `scripts/eval.ts` | ⚠️  Baseline failures (16 fixtures: 1✅ 7⚠️ 8❌) — pre-existing, unchanged by Phase 24 |

---

## False Positive Controls

1. **Auth route skip patterns** — `/login`, `/signin`, `/auth/login`, `/auth/callback`, `/auth/verify` are excluded from auth guard checks
2. **User settings exclusion** — `settings/` paths are excluded from admin route detection unless clearly admin paths
3. **Docs-only skip** — `MissingTestDetector` and `CriticalFeatureCoverageAnalyzer` skip when all changed files are docs/infra
4. **Binary file skip** — All analyzers skip binary files
5. **Skipped paths** — `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `vendor` always filtered
6. **Parameterized SQL skip** — `SqlInjectionAnalyzer` skips properly parameterized queries (`?` or `$1`)
7. **Deduplication** — All findings deduplicated by `id` before return

---

## Remaining Limitations

1. **Hunk parsing** — GitDiffEngine uses `git diff -U0` with line-level parsing. For very large hunks (>10k lines), parsing may be slow
2. **Renamed file detection** — Uses `git diff --name-status` with score threshold 0; may miss some renames
3. **Secret detection regex** — May produce false positives on long strings that happen to look like secrets; does not verify against known secret patterns (would need API call)
4. **Function signature analysis** — Heuristic-based; does not perform full TypeScript type inference
5. **Test coverage heuristic** — Uses file name matching only; does not verify actual test execution or coverage percentage
6. **Docs-only skip** — Only skips when ALL changed files are in docs ownership category; partial docs changes still trigger checks
7. **Huge diffs (>100 files)** — Confidence degrades to `low`; may miss cross-file issues

---

## Files Changed

| File | Change |
|------|--------|
| `packages/diff-analyzers/` | **NEW** — full package (8 security + 6 correctness + 4 test-coverage analyzers) |
| `packages/diff-analyzers/tests/` | **NEW** — fixtures + unit tests (27 passing) |
| `packages/core/src/runner/stages/diffScopedStage.ts` | **NEW** — orchestrator stage |
| `packages/core/src/runner/stages/index.ts` | Added `runDiffScopedStage` export |
| `packages/core/src/orchestrator/ReviewStage.ts` | Added `'diff-scoped'` to `StageId` |
| `packages/core/src/orchestrator/ReviewOrchestrator.ts` | Wired diff-scoped stage into review pipeline |
| `packages/core/package.json` | Added `@turpan/diff-analyzers` dependency |
| `packages/git-diff/src/GitDiffEngine.ts` | `computeDiffRecommendation` upgraded with additionalFindings param |
| `packages/report/src/types.ts` | `DiffReview` extended with new fields |
| `packages/report/src/DiffFindingsWriter.ts` | JSON output extended with introducedFindings, testCoverage, mergeDecision |
| `packages/report/src/PrCommentWriter.ts` | PR comment extended with Top 5 Risks, Test Coverage, Reproduction Commands |
| `apps/cli/src/index.ts` | `DiffReview` typed properly, all new fields populated |

---

## Phase 24 Verdict

**READY** — All new analyzers implemented, tested, and integrated. Build passes. Tests pass. Eval baseline unchanged. The system now deeply reviews diff hunks for introduced risks, correctness issues, and test coverage gaps.
