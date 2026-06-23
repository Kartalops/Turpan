# Phase 23 Handoff — Context 82%

## Objective
Fix 8 eval fixture failures (mustDetect pattern mismatches) to make Turpan eval trustworthy for public beta.

## Completed Work

### Analyzer Fixes (verified in source):
1. **PythonPlugin.ts**: Fixed path-vs-content bug. Now reads file content properly for bare-except detection, broad-except-pass detection, and auth-not-applied detection
2. **MCPPlugin.ts**: Fixed same path-vs-content bug. Now reads file content for shell-exec, filesystem validation, and timeout detection
3. **plugins/index.ts**: Added missing sandbox exports (DEFAULT_TRUSTED_PLUGINS, PLUGIN_PERMISSIONS, etc.)
4. **eval.ts**: Removed hardcoded `--plugins security-basic` to allow plugin auto-detection

### Infrastructure Fixes Applied:
- `apps/cli/src/index.ts`: Changed `runAnalysis as coreRunAnalysis` → `runAnalysis` (tsup was mangling alias)
- `apps/cli/tsup.config.ts`: Added `noExternal` for @turpan packages (reverted due to playwright conflicts)
- `.npmrc`: Added `shamefully-hoist=true` to ensure pnpm workspace links work
- `scripts/eval.ts`: Modified to use `pnpm exec tsx apps/cli/src/index.ts` instead of calling dist directly

## BLOCKING ISSUE: tsup Build Cache

Despite source changes to `apps/cli/src/index.ts`:
- Source: `import { runAnalysis, planAnalysis, detectProject }` (correct)
- Built dist: `import { runAnalysis, loadConfig, coreRunAnalysis, ... }` (wrong)

This causes: `SyntaxError: The requested module '@turpan/core' does not provide an export named 'coreRunAnalysis'`

**Root cause**: tsup build cache is producing stale output despite `rm -rf dist` and rebuild.

## BLOCKING ISSUE: Eval Finds 0 Results

Even when CLI runs, all fixtures report 0 findings. The eval runner reads:
```
const fixtureRunDir = join(fixtureDir, '.turpan', 'runs', 'latest');
```
But the fixture directory has NO `.turpan` subdirectory after the run. The CLI may be writing to the repo's `.turpan/runs/` instead.

## Files Changed

| File | Status |
|------|--------|
| `packages/core/src/plugins/builtin/python/PythonPlugin.ts` | ✅ Fixed |
| `packages/core/src/plugins/builtin/mcp/MCPPlugin.ts` | ✅ Fixed |
| `packages/core/src/plugins/index.ts` | ✅ Fixed |
| `scripts/eval.ts` | ✅ Modified |
| `apps/cli/src/index.ts` | ✅ Modified |
| `apps/cli/tsup.config.ts` | ⚠️ Reverted |
| `.npmrc` | ✅ Created |
| `PHASE_23_EVAL_BASELINE_REPAIR_REPORT.md` | ✅ Created |

## Validation Results

| Check | Result |
|-------|--------|
| `pnpm build` | ✅ Pass |
| `pnpm eval` | ❌ 0 findings for all fixtures |

## Exact Resume Instructions

1. **Fix tsup cache**: Delete `/home/oguz/Masaüstü/TurPAN-Review-Agent/node_modules/.cache`, then `rm -rf apps/cli/dist && pnpm --filter @turpan/cli run build`. Verify dist/index.js import line is correct.

2. **Fix CLI findings path**: The CLI needs to write `TURPAN_FINDINGS.json` to the fixture's `.turpan/runs/latest/` not the repo's. Check the `runPath` parameter being passed to `runAnalysis()`.

3. **Run `pnpm eval`** to verify analyzers produce findings.

4. **Run full eval suite**: `pnpm eval` should show improved pass rates.
