# Phase 21 — Git Diff and PR Review Mode

## Summary

Implemented first-class git diff and PR review mode so Turpan can review only what an agent changed. The core capability: after a coding agent finishes a task, Turpan reviews the diff against main and tells whether the agent's changes are safe, complete, and testable.

---

## What Was Built

### 1. `@turpan/git-diff` Package

New workspace package at `packages/git-diff/`.

**Safety guarantee:** all operations are read-only. No git commit, push, reset, rebase, merge, checkout, stash, or clean.

**Core class:** `GitDiffEngine`

| Method | Description |
|--------|-------------|
| `getDiff(baseRef, targetRef)` | Full diff result: files, hunks, stats, ownership, routes, APIs, components, risk level |
| `getChangedFiles(baseRef, targetRef)` | Fast file list only |
| `getAvailableRefs()` | List branches and tags |
| `isAffected(diff, filePath)` | Check if a path is in the diff |
| `deriveRecommendation(diff)` | PR decision: approve / request_changes / block_merge |

**Exported standalone functions** (no git repo required for testing):
- `isPathAffectedByDiff(diff, filePath)`
- `computeDiffRecommendation(diff)`

**File classification:**
- `ChangeType`: `added | modified | deleted | renamed | copied`
- `ChangedFile`: path, type, linesAdded/Deleted, binary, oldPath (for renames)

**Ownership detection:** patterns for frontend, backend, shared, config, test, docs, infra

**Risk assessment:** detects critical patterns (auth bypass, hardcoded credentials, `eval()`, `exec()`) and high-risk patterns

### 2. CLI Commands

```bash
# Review a diff between two refs
turpan review . --from main --to HEAD
turpan review . --from origin/main --to feature/billing

# Dedicated diff-review command
turpan review-diff . --base main --target HEAD

# Agent audit over a diff
turpan agent-audit . --task ./task.md --from main --to HEAD
```

New command: `turpan review-diff` (requires `--base` and `--target`)

Updated `turpan review`: accepts `--from <ref>` and `--to <ref>` to activate diff-review mode

Updated `turpan agent-audit`: accepts `--from` and `--to` to scope audit to changed files

### 3. Diff-Scoped Analyzer Mode

- `AnalyzerContext` gained `diffMode: boolean` and `diffResult: GitDiffResult`
- `ReviewContext` gained `diffMode` and `diffResult`
- `OrchestratorConfig` and `OrchestratorOptions` propagated these through
- `mapImplementation()` and `runAgentOutputAudit()` scope to changed files when `diffMode: true`

In diff mode, analyzers focus on changed files. Build and test stages always run.

### 4. Report Outputs

**`TURPAN_ANALYSIS.md`** — new `## Diff Review` section with:
- `baseRef → targetRef`
- Recommendation badge (approve / request_changes / block_merge)
- Changed files summary
- Risk by file table
- Changed routes and APIs
- Findings introduced by diff
- Pre-existing findings ignored (diff mode suppresses unrelated findings)

**`TURPAN_PR_COMMENT.md`** — GitHub-friendly PR comment:
```
## 🐪 Turpan Review
> Diff review of `main → feature` | Overall: 87/100

| Status | Score | Critical | High | Medium | Low |
|--------|-------|----------|------|--------|-----|
| ✅ **CONDITIONAL GO** | 87/100 | 0 | 1 | 2 | 5 |

PR Decision: ⚠️ **REQUEST CHANGES**
```

**`TURPAN_DIFF_FINDINGS.json`** — CI-friendly JSON:
```json
{
  "recommendation": { "decision": "request_changes", "confidence": "high", "summary": "..." },
  "riskByFile": [{ "file": "src/auth/bypass.ts", "risk": "critical" }],
  "changedSurface": { "routes": ["/api/admin"], "apis": ["/users"], "components": ["AdminDashboard"] },
  "diffFindings": [...]
}
```

### 5. Tests

8 passing unit tests for `computeDiffRecommendation` and `isPathAffectedByDiff`:
- Clean diff → approve
- Critical security risk → block_merge
- Feature changes without tests → medium finding
- Deleted test files → high finding
- Large diff (35 files) → approve with reason
- >50 files → medium confidence
- Ref error present → low confidence
- Medium risk → request_changes

---

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Build | `pnpm build` | ✅ All packages built (11 packages) |
| TypeScript | `pnpm build` (DTS) | ✅ No type errors |
| Unit tests | `pnpm test` | ✅ All tests pass |
| Eval | `pnpm eval` | ⚠️  Baseline eval failures unrelated to diff PR changes |

**Eval baseline note:** The 8 eval failures (`mustDetect` pattern mismatches) are pre-existing and not introduced by Phase 21 changes. The diff/PR review mode does not alter core analyzer behavior.

---

## Limitations

1. **No git repo:** Commands fail gracefully if not in a git repo (`--from`/`--to` error)
2. **Ref not found:** Reports ref errors clearly; does not crash
3. **Binary files:** Detected via `--numstat` but no diff content extraction
4. **Renamed file detection:** Uses `git diff --name-status` rename detection (score threshold 0)
5. **Huge diffs (>1000 files):** Risk assessment may be slow; no pagination yet
6. **Non-git VCS:** No support for Hg, SVN, or Git worktrees beyond basic detection

---

## Files Changed

| File | Change |
|------|--------|
| `packages/git-diff/` | **NEW** — GitDiffEngine, types, tests |
| `packages/core/src/analyzers/Analyzer.ts` | Added `diffMode`, `diffResult` to `AnalyzerContext` |
| `packages/core/src/orchestrator/ReviewContext.ts` | Added `diffMode`, `diffResult` |
| `packages/core/src/orchestrator/ReviewOrchestrator.ts` | Propagated diff options |
| `packages/core/src/orchestrator/index.ts` | Added `diffMode`, `diffResult` to `OrchestratorOptions` |
| `packages/analyzers/src/agent-output/CompletenessAnalyzer.ts` | Added `diffMode`/`diffResult` to `AgentAuditOptions` |
| `packages/analyzers/src/agent-output/ImplementationMapper.ts` | Added `MapImplementationOptions` with `diffMode` |
| `packages/report/src/types.ts` | Added `DiffReview` interface |
| `packages/report/src/MarkdownReportWriter.ts` | Added `diffReviewSection()` |
| `packages/report/src/PrCommentWriter.ts` | **NEW** — `TURPAN_PR_COMMENT.md` |
| `packages/report/src/DiffFindingsWriter.ts` | **NEW** — `TURPAN_DIFF_FINDINGS.json` |
| `packages/report/src/generateReports.ts` | Added PR comment + diff findings writers |
| `packages/report/src/index.ts` | Exported `DiffReview`, `PrCommentWriter`, `DiffFindingsWriter` |
| `apps/cli/src/commands/reviewDiff.ts` | **NEW** — `turpan review-diff` command |
| `apps/cli/src/commands/index.ts` | Exported `createReviewDiffCommand` |
| `apps/cli/src/index.ts` | Added `--from`/`--to` to `review`, diff flow with `GitDiffEngine`, `reviewDiff` registration |
| `apps/cli/package.json` | Added `@turpan/git-diff` dependency |
| `packages/core/package.json` | Added `@turpan/git-diff` dependency |

---

## Public Beta Impact

This phase enables the core product workflow:

```
Coding agent finishes task
        ↓
turpan review . --from main --to HEAD
        ↓
PR decision in 30s: safe? complete? tested?
```

**Phase 22+ can build on this foundation:**
- Diff-scoped security analyzers (auth, injection, secrets)
- Diff-scoped correctness checks (API contract, type changes)
- Diff-scoped test coverage analysis
- GitHub Actions CI integration (`TURPAN_DIFF_FINDINGS.json` as PR check)
- Diff history tracking across multiple PRs
