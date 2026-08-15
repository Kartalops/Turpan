# Phase 5: Static Code Quality & Cleanup — Implementation Report

**Date:** 2026-06-19
**Status:** ✅ Complete — 28/28 analyzer tests passing

---

## Summary

Phase 5 implements generic static analysis infrastructure and seven specialized analyzers for detecting code quality problems beyond lint errors. All analyzers are wired into the CLI (`turpan review . --quality`, `turpan cleanup-scan`) and interactive shell. Findings include confidence scores and are integrated into the standard report with a dedicated "Code Quality & Cleanup" section.

---

## Architecture

### Generic Analyzer Interface
**`packages/core/src/analyzers/Analyzer.ts`**

```typescript
interface Analyzer {
  id: string;                              // unique, e.g. "unused-dependency"
  name: string;                            // human-readable
  categories: string[];                    // Finding categories this analyzer produces
  supports(ProjectFingerprint): boolean;   // which projects it applies to
  run(AnalyzerContext): Promise<AnalyzerResult>;
}
```

### Analyzer Registry
**`packages/core/src/analyzers/AnalyzerRegistry.ts`**

- Singleton `globalRegistry` — analyzers self-register on import
- `applicableTo(fingerprint)` — returns analyzers that support a given project
- `runApplicable()` — runs all applicable analyzers, returns `AnalyzerResult[]`
- `groupByCategory()` — organizes results by Finding category

### Stage Integration
**`packages/core/src/runner/stages/staticQualityStage.ts`**

Maps to three `StageId` values, fanning out to applicable analyzers:
- `static-quality` → maintainability, dependency, architecture, agent-output analyzers
- `dead-code-basic` → dead-code analyzers only
- `security-basic` → security analyzers only

### Report Sections
**`packages/core/src/reports/index.ts`**

Added `## Code Quality & Cleanup` with three subsections:
- **Safe Cleanup Candidates** — unused dependencies (lowest risk)
- **Risky Cleanup Candidates** — dead code, maintainability, architecture issues
- **Agent-like Implementation Smells** — placeholder/TODO/fake/mock patterns

---

## Analyzers Implemented

### 1. Unused Dependency Analyzer
**`packages/core/src/analyzers/dependencies/UnusedDependencyAnalyzer.ts`**
- Reads `package.json`, finds all source files, scans for import/require references
- Skips framework staples (React, TypeScript, Vite, Jest, etc.)
- Conservative: only flags deps with zero references
- Category: `dependency`

### 2. Unused File Analyzer
**`packages/core/src/analyzers/dead-code/UnusedFileAnalyzer.ts`**
- Finds likely orphaned component/utility/hook files
- Skips routes, config files, entrypoints, type files
- Uses import graph: files with zero importers are flagged
- Category: `dead-code`

### 3. Unused Export Analyzer
**`packages/core/src/analyzers/dead-code/UnusedExportAnalyzer.ts`**
- Scans all source files for named exports and imports
- Flags exported symbols never referenced globally
- Conservative: skips re-exports, dynamic imports
- Category: `dead-code`

### 4. Placeholder / Fake Implementation Analyzer
**`packages/core/src/analyzers/placeholders/PlaceholderAnalyzer.ts`**
- Detects: `TODO`, `FIXME`, `placeholder`, `coming soon`, `not implemented`, `mock`, `fake`, `demo only`, `throw new Error("Not implemented")`, hardcoded `return true`, console-only implementations, AI-generated code markers
- Severity scales with confidence: high-confidence patterns get `medium`, lower-confidence get `low`
- Categories: `agent-output` (high confidence) or `maintainability`

### 5. Duplicate Code Analyzer
**`packages/core/src/analyzers/placeholders/DuplicateCodeAnalyzer.ts`**
- Computes Jaccard similarity between all file pairs
- Flags files ≥85% similar
- Reports similarity percentage as metric evidence
- Category: `maintainability`

### 6. Complexity Hotspot Analyzer
**`packages/core/src/analyzers/static-quality/ComplexityHotspotAnalyzer.ts`**
- **Large files:** >500 lines → `medium`, >1000 lines → `high`
- **Large functions:** >80 lines → `medium`, >120 lines → `high`
- **High cyclomatic complexity:** >10 branches → `medium`, >20 → `high`
- **Large React components:** >300 lines in `.tsx` files
- **Deeply nested conditionals:** >4 levels
- Category: `maintainability`

### 7. Architecture Basic Analyzer
**`packages/core/src/analyzers/architecture-basic/ArchitectureBasicAnalyzer.ts`**
- **Circular import detection:** DFS-based cycle detection with path normalization
- **API/client duplication:** flags hardcoded API URLs referenced in ≥3 files
- **Scattered `process.env`:** flags direct env access across ≥3 files without central config
- **Business logic in UI:** flags React/Vue component files with direct API/database calls
- Category: `architecture`

---

## CLI Commands

| Command | Description |
|---|---|
| `turpan review . --quality` | Run static code quality analyzers only (no build/test/lint) |
| `turpan cleanup-scan [path]` | Read-only cleanup scan with report |

**Interactive shell intents added:**
- `cleanup-scan` — runs cleanup scan
- `find unused code` — runs dead-code analyzers
- `clean code quality` — runs quality analyzers
- `detect fake implementation` — runs placeholder analyzer

---

## Finding Schema

All findings include:
- `confidence: 0–100` (branded type)
- `suggestedFix` with specific remediation
- `evidence` array with type, label, path, excerpt, metric
- `fixable: 'auto' | 'manual' | 'none'`
- `category` for grouping: `dead-code | dependency | maintainability | architecture | agent-output`

---

## Test Fixtures

**`packages/core/tests/fixtures/code-quality-fixture/`**

| Fixture | Purpose |
|---|---|
| `UnusedButton.tsx` | Orphaned component — unused export/file |
| `LargeComponent.tsx` | 851-line component with large function, nested conditionals |
| `FakeApiClient.ts` | TODO, not implemented, mock returns, AI markers |
| `mathUtils.ts` / `stringUtils.ts` | 160+ line files with ~80% Jaccard similarity |
| `AppLayout.tsx` | Business logic in UI component |
| `App.tsx` | Scattered `process.env` usage (8 refs) |
| `ApiService.ts` / `helper.ts` | Circular import pair |
| `useMounted.ts` | Unused exports |

---

## Validation

```
 ❯ tests/analyzers.test.ts  (28 tests) 60ms
   ✓ UnusedDependencyAnalyzer  (3 tests)
   ✓ UnusedFileAnalyzer        (3 tests)
   ✓ UnusedExportAnalyzer       (2 tests)
   ✓ PlaceholderAnalyzer        (6 tests)
   ✓ DuplicateCodeAnalyzer      (2 tests)
   ✓ ComplexityHotspotAnalyzer  (4 tests)
   ✓ ArchitectureBasicAnalyzer  (4 tests)
   ✓ Analyzer Interface        (3 tests)

Test Files  1 passed
     Tests  28 passed
```

**Note:** The `build` stage that `turpan review` depends on is Phase 2/3 territory. Analyzers run correctly when the review pipeline is wired with stage overrides.

---

## Files Created / Modified

| File | Change |
|---|---|
| `packages/core/src/analyzers/Analyzer.ts` | New — Analyzer interface |
| `packages/core/src/analyzers/AnalyzerRegistry.ts` | New — registry + global singleton |
| `packages/core/src/analyzers/runAnalyzers.ts` | New — run utilities + cleanup categorization |
| `packages/core/src/analyzers/index.ts` | New — barrel exports |
| `packages/core/src/analyzers/dependencies/UnusedDependencyAnalyzer.ts` | New |
| `packages/core/src/analyzers/dead-code/UnusedFileAnalyzer.ts` | New |
| `packages/core/src/analyzers/dead-code/UnusedExportAnalyzer.ts` | New |
| `packages/core/src/analyzers/placeholders/PlaceholderAnalyzer.ts` | New |
| `packages/core/src/analyzers/placeholders/DuplicateCodeAnalyzer.ts` | New |
| `packages/core/src/analyzers/static-quality/ComplexityHotspotAnalyzer.ts` | New |
| `packages/core/src/analyzers/architecture-basic/ArchitectureBasicAnalyzer.ts` | New |
| `packages/core/src/shared/fileWalker.ts` | New — recursive file walker (no deps) |
| `packages/core/src/shared/index.ts` | New — shared utilities barrel |
| `packages/core/src/runner/stages/staticQualityStage.ts` | New — stage implementation |
| `packages/core/src/runner/stages/index.ts` | Updated — exports stage |
| `packages/core/src/orchestrator/ReviewOrchestrator.ts` | Updated — wired stage |
| `packages/core/src/orchestrator/index.ts` | Updated — skipStaticQuality/Security/DeadCode |
| `packages/core/src/reports/index.ts` | Updated — Code Quality & Cleanup section |
| `packages/shared/src/types/index.ts` | Updated — Intent type |
| `apps/cli/src/commands/review.ts` | Updated — `--quality` flag |
| `apps/cli/src/index.ts` | Updated — `--quality` flag, cleanup-scan command, shell intents |
| `apps/cli/src/commands/cleanupScan.ts` | New — cleanup-scan command |
| `apps/cli/src/shell/shell.ts` | Updated — new intent handlers |
| `apps/cli/src/shell/intent.ts` | Updated — new intents + labels |
| `packages/core/tests/analyzers.test.ts` | New — 28 unit tests |
| `packages/core/tests/fixtures/code-quality-fixture/` | New — test fixture project |

---

## Risks & Known Limitations

1. **Conservative mode**: Unused export analyzer may under-report due to dynamic imports, `require()` from outside the scanned tree, and reflective usage.
2. **Import graph false negatives**: Files imported only via dynamic `import()` expressions are treated as orphans.
3. **Complexity heuristics**: Cyclomatic complexity is counted via regex, not AST parsing — may miss ternary operators and switch-case fallthrough.
4. **No deletion**: The system only reports findings. No files or dependencies are modified.
5. **Confidence calibration**: Confidence scores are tuned for TypeScript/React projects — may be less accurate for other frameworks.

---

## Next Steps

1. **Phase 6 (UI Live)**: Implement Playwright-based UI component smoke tests
2. **Phase 7 (Fix Automation)**: Implement safe auto-fix for unused dependencies (`npm uninstall`)
3. **AST-based analyzers**: Replace regex-based complexity detection with proper TypeScript AST parsing
4. **Language expansion**: Python analyzer for `requirements.txt` unused packages, Rust `Cargo.toml` analyzer
5. **Report improvements**: Add per-finding confidence-weighted scoring to the scorecard
