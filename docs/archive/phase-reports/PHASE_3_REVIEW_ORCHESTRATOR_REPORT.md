# Phase 3: Review Orchestrator & Evidence-Based Finding System — Implementation Report

## Summary

Implemented the Review Orchestrator and structured Finding system for Turpan. Every issue is now a structured `Finding` backed by concrete `Evidence` — no more vague assertions. The orchestrator generates a `ReviewPlan` from the `ProjectFingerprint`, runs placeholder stages, and produces the full structured report.

## What Was Built

### Findings Core (`packages/core/src/findings/`)

| File | Purpose |
|------|---------|
| `Finding.ts` | Core `Finding` type — id, title, severity, category, file, line, command, explanation, evidence[], suggestedFix, fixable, confidence, tags |
| `Evidence.ts` | `Evidence` type — type (9 variants), path, excerpt, url, timestamp, command, exitCode, value/unit, metadata |
| `FindingStore.ts` | In-memory store with filtering (severity, category, confidence, file), sorting, grouping |
| `severity.ts` | Severity utilities — `formatSeverity`, `severityCode`, `severityWeight`, `worstSeverity`, `SEVERITY_ORDER`, `SEVERITY_DESCRIPTIONS` |
| `score.ts` | Score calculation — `calculateScorecard` (10-dimension 0–100 scores), `computeVerdict` (GO/CONDITIONAL_GO/NO_GO/INTERNAL_ONLY), `countBySeverity`, `countByCategorySimple` |
| `formatFinding.ts` | Display formatters — `formatFindingForDisplay`, `formatFindingMarkdown`, `formatFindingTableRow`, `formatEvidenceItem` |

**Key design decisions:**
- `Confidence` is a branded `number & { readonly brand: unique symbol }` — prevents accidental misuse
- `createFinding()` **throws** if evidence array is empty — every Finding MUST have evidence
- Finding IDs auto-generated as `fnd-<timestamp36><counter36>`
- Score deductions scale with severity × confidence × category weight

### Review Orchestrator (`packages/core/src/orchestrator/`)

| File | Purpose |
|------|---------|
| `ReviewStage.ts` | `StageId` union (13 stages), `StageStatus`, `StageResult`, `ReviewStage` interface, `ReviewStageContext` |
| `ReviewContext.ts` | Shared `ReviewContext` passed through all stages — fingerprint, config, findings store, stage results, elapsed time |
| `ReviewPlan.ts` | `generateReviewPlan(fingerprint, options)` — fingerprint-driven stage selection; `formatPlanSummary` |
| `ReviewOrchestrator.ts` | `runReview(orchConfig)` — executes stages in order, merges findings, computes scorecard/verdict |

### Review Stages

All 13 stages wired with placeholder implementations (real execution in next phase):

```
project-fingerprint → install-check → script-detection → build → test → lint → typecheck → [static-quality] → [security-basic] → [dead-code-basic] → [ui-live-basic] → report
```

- `[static-quality]`, `[security-basic]`, `[dead-code-basic]` — only when `deepAnalysis: true`
- `[ui-live-basic]` — only when UI framework detected AND `uiAnalysis: true`

### Report Structure (`TURPAN_ANALYSIS.md`)

The full report now includes all required sections:

```
## Verdict
## Scorecard
  - 10 dimensions: overall, build_health, test_health, code_quality, security,
    ui_runtime, architecture, dead_code, agent_output, release_readiness
## Project Fingerprint
## Review Plan
## Findings by Severity
## Findings by Category
## Evidence Index
## Next Actions
```

### CLI Changes (`apps/cli/src/index.ts`)

- `turpan review . --plan` — prints the planned stages without running analysis
- `turpan review . --deep` — enables deep stages (static-quality, security-basic, dead-code-basic)
- `turpan review . --ui` — enables UI stages (ui-live-basic)
- `turpan review . --deep --plan` — shows deep plan
- Interactive shell: `analyze this project deeply` → calls real orchestrator with `deepAnalysis: true`
- All local CLI stubs (`writePlaceholderReports`, local `detectProject`, `ProjectInfo`) removed — fully delegated to `@turpan/core`

### Shared Types (`packages/shared/src/types/index.ts`)

`Finding` type extended with structured evidence, category, confidence, fixability — while maintaining backward compatibility via optional legacy fields (`type`, `description`, `fixAvailable`, `fixDescription`).

## Validation

```
pnpm -r run build          ✅ Pass (shared, core, cli)
cd packages/core && vitest run   ✅ 72 tests pass (36 fingerprint + 36 orchestrator/score)
turpan review . --plan     ✅ Shows correct stage plan for Turpan project
turpan review . --deep --plan  ✅ Shows deep stages
turpan review .            ✅ Runs orchestrator, writes TURPAN_ANALYSIS.md
```

Sample `turpan review . --plan` output for this project:
```
## Review Plan
**Stages:** 7  |  **Estimated:** < 1s + 5–30s + < 1s + 10–120s + 10–300s + 5–60s + < 1s
**UI Stages:** No  |  **Python:** No  |  **Deep:** No
| # | Stage | Reason |
|---|-------|--------|
| 1 | Project Fingerprint | Core stage — always runs |
| 2 | Install Check | Core stage — always runs |
| 3 | Script Detection | Core stage — always runs |
| 4 | Build | Build commands detected: build |
| 5 | Test | Test commands detected: test |
| 6 | Lint | Lint commands: lint |
| 7 | Report Generation | Finalize and write reports |
```

## Test Coverage

**72 tests total (36 new + 36 pre-existing):**

| Suite | Tests | Coverage |
|-------|-------|---------|
| `orchestrator.test.ts` | 36 | Score calculation, verdict computation, severity formatting, ReviewPlan generation, Finding creation, Evidence creation |
| `fingerprint.test.ts` | 36 | All fingerprint detectors and formatting |

## Limitations

1. **All stages are placeholders** — `build`, `test`, `lint`, `typecheck` do nothing yet; next phase wires real command execution
2. **`ui-live-basic` requires Playwright/browser setup** — planned but not yet implemented
3. **Python project stages** — plan generation detects Python correctly (`includesPython: true`) but no Python-specific stages are wired yet
4. **Scorecard formula is illustrative** — the weighting (e.g. `build_health × 1.0`, `dead_code × 0.3`) is a reasonable starting point but not yet calibrated against real project data
5. **`confidence` type uses branded number** — requires `confidence()` helper; plain numbers cast directly would bypass the type

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/index.ts` | Extended `Finding` with structured evidence, category, confidence, fixability |
| `packages/core/src/findings/Evidence.ts` | New — `Evidence` type + helpers |
| `packages/core/src/findings/Finding.ts` | New — `Finding` type + `createFinding`, `createPlaceholderFinding` |
| `packages/core/src/findings/FindingStore.ts` | New — in-memory store with filtering/sorting |
| `packages/core/src/findings/severity.ts` | New — severity utilities |
| `packages/core/src/findings/score.ts` | New — scorecard calculation, verdict computation |
| `packages/core/src/findings/formatFinding.ts` | New — display formatters |
| `packages/core/src/findings/index.ts` | Updated — exports all new modules |
| `packages/core/src/orchestrator/ReviewStage.ts` | New — stage types and context |
| `packages/core/src/orchestrator/ReviewContext.ts` | New — shared context |
| `packages/core/src/orchestrator/ReviewPlan.ts` | New — fingerprint-driven plan generation |
| `packages/core/src/orchestrator/ReviewOrchestrator.ts` | New — orchestrator runner |
| `packages/core/src/orchestrator/index.ts` | Updated — re-exports + delegates to new orchestrator |
| `packages/core/src/reports/index.ts` | Updated — full structured report with verdict/scorecard/fingerprint |
| `packages/core/src/context/index.ts` | No changes needed |
| `packages/core/tests/orchestrator.test.ts` | New — 36 tests |
| `apps/cli/src/index.ts` | Updated — `--plan`, `--deep`, `--ui` flags, real orchestrator, shell wired to orchestrator |

## Next Steps (Next Phase)

- [ ] Implement real `build` stage runner — run `npm run build`, capture exit code + output as evidence
- [ ] Implement real `test` stage runner — run test commands, parse output, emit findings
- [ ] Implement real `lint` stage runner — run linter, emit findings per file/line
- [ ] Implement real `typecheck` stage runner — run TypeScript compiler, emit findings
- [ ] Implement `static-quality` — grep for TODO/FIXME, console.log, any-typed values
- [ ] Implement `security-basic` — check for hardcoded secrets, known vulnerable patterns
- [ ] Implement `dead-code-basic` — detect unused exports with build tool analysis
- [ ] Implement `ui-live-basic` — Playwright smoke test runner (requires browser setup)
- [ ] Implement `install-check` — verify `node_modules` exists and lockfile is intact
- [ ] Implement `script-detection` — validate that detected scripts actually exist in package.json

## Final Verdict

**READY** — Orchestrator and evidence-based finding system fully implemented and tested:
- ✅ Structured `Finding` and `Evidence` types with every required field
- ✅ `createFinding()` enforces evidence requirement (throws if empty)
- ✅ 13-stage orchestrator with fingerprint-driven plan generation
- ✅ Scorecard with 10 dimensions, verdict computation
- ✅ `turpan review . --plan` and `turpan review . --deep --plan` work
- ✅ Full structured report with all required sections
- ✅ Interactive shell `analyze this project deeply` wired to real orchestrator
- ✅ 72 tests passing (36 new orchestrator/score tests)
- ✅ Clean build across all packages
