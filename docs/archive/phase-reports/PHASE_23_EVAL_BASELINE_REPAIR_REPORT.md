# Phase 23: Eval Baseline Repair & Detection Hardening

## Status: IN PROGRESS — BLOCKED by CLI module resolution

### Summary

Phase 23 was initiated to fix 8 failing `mustDetect` eval assertions. The root cause analysis revealed **two critical infrastructure bugs** that prevent the eval suite from running correctly, plus **analyzer bugs** that were fixed.

---

## Root Cause Analysis

### Bug 1: CLI `coreRunAnalysis` Import Mangling (BLOCKING)

**Severity**: CRITICAL — prevents ALL eval runs

**Problem**: The `apps/cli` build (tsup) is incorrectly resolving `runAnalysis as coreRunAnalysis` imports from `@turpan/core`. The source correctly has:
```typescript
import { runAnalysis as coreRunAnalysis, planAnalysis, detectProject } from '@turpan/core';
```

But the built dist produces:
```javascript
import { runAnalysis, loadConfig, coreRunAnalysis, ... } from '@turpan/core';
```

This causes a runtime error: `The requested module '@turpan/core' does not provide an export named 'coreRunAnalysis'`.

**Workaround Applied**: Modified `scripts/eval.ts` to use `pnpm exec tsx apps/cli/src/index.ts` instead of directly calling the dist. This allows the eval to run through pnpm's proper workspace module resolution.

**Note**: Even with `pnpm exec tsx`, the CLI runs at 0 findings because the eval script reads findings from the **fixture's** `.turpan/runs/latest/` directory, which may not exist or may be empty after the CLI run.

---

### Bug 2: Eval Finds 0 Findings for ALL Fixtures

**Severity**: CRITICAL — eval cannot validate any assertions

**Problem**: Despite running the CLI through pnpm exec tsx, the eval runner consistently reports 0 findings for all fixtures. The issue appears to be in where the eval script reads results from:

```typescript
// The eval runner reads from:
const fixtureRunDir = join(fixtureDir, '.turpan', 'runs', 'latest');
const findingsPath = join(fixtureRunDir, 'TURPAN_FINDINGS.json');
```

But the CLI may be writing results to a different location (e.g., the **repo's** `.turpan/runs/latest/` instead of the **fixture's** `.turpan/runs/latest/`).

**Evidence**: After running `pnpm eval --fixture python-bot-broad-except-pass`:
- `/examples/fixtures/python-bot-broad-except-pass/.turpan/` does NOT exist
- `/home/oguz/Masaüstü/TurPAN-Review-Agent/.turpan/runs/latest/` exists but has no `TURPAN_FINDINGS.json`

---

## Analyzer Bugs Fixed

### 1. PythonPlugin.ts — Path vs Content Detection Bug

**Fixed**: The Python plugin was testing **file paths** instead of **file contents** for all pattern detection:

```typescript
// BROKEN — tests f (file path string), not content
const bareExcepts = pyFiles.filter((f: string) =>
  /\bexcept\s*:/i.test(f) && !/\bexcept\s*\w.*:/i.test(f)
);
```

**Fix Applied**: Now reads actual file content:
```typescript
for (const file of pyFiles) {
  let content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue; // skip comments
    if (BARE_EXCEPT_RE.test(line) && !SPECIFIC_EXCEPT_RE.test(line)) {
      bareExceptHits.push({ file, line: i + 1, excerpt: line.trim() });
    }
  }
}
```

### 2. PythonPlugin.ts — Added Missing Detection Patterns

**Added**:
- Auth-not-applied detection (verify_* functions exist but no routes use them)
- Broad-except-pass detection (except Exception: pass — silent swallow)
- Proper evidence with file paths and line numbers

### 3. MCPPlugin.ts — Same Path vs Content Bug

**Fixed**: The MCP plugin had the identical bug — testing file paths instead of content for:
- Shell execution detection
- Unvalidated filesystem access
- Missing timeout detection

**Fix Applied**: Now reads actual file content and searches for patterns within files.

### 4. eval.ts — Hardcoded `--plugins security-basic`

**Fixed**: The eval runner was hardcoding `--plugins security-basic` which prevented Python, Next.js, SaaS, and MCP plugins from running.

```typescript
// BEFORE
'--plugins', 'security-basic',

// AFTER (let plugins auto-detect)
// Removed --plugins flag entirely to allow auto-detection
```

---

## Before/After Eval Status

| Fixture | Before | After | Status |
|---------|--------|-------|--------|
| fastapi-auth-bypass | 2/11 pass | 2/11 pass | Still failing — analyzer needs verification |
| python-bot-broad-except-pass | 2/13 pass | 2/13 pass | Still failing — CLI not finding findings |
| mcp-unsafe-tool | 7/8 pass | 7/8 pass | Still failing — analyzer needs verification |
| mcp-wide-filesystem-access | 2/12 pass | 2/12 pass | Still failing — CLI not finding findings |
| next-saas-button-noop | 3/12 pass | 3/12 pass | Still failing |
| next-saas-noop-tests | 3/11 pass | 3/11 pass | Still failing |
| next-saas-readme-mismatch | 6/14 pass | 6/14 pass | Still failing |
| node-cli-broken-help | 3/11 pass | 3/11 pass | Still failing |

---

## Remaining Issues

### 1. CLI Finding 0 Results (BLOCKING)

The CLI is running but producing 0 findings. This needs investigation into:
- Where the CLI actually writes `TURPAN_FINDINGS.json`
- Whether the project fingerprint is being detected correctly
- Whether plugins are actually being loaded

### 2. tsup Build Cache Corruption

The tsup build is producing incorrect output despite correct source. This needs:
- Clearing tsup cache
- Or switching to a different build approach

---

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/plugins/builtin/python/PythonPlugin.ts` | Fixed path-vs-content bug, added auth-not-applied detection, added broad-except-pass detection |
| `packages/core/src/plugins/builtin/mcp/MCPPlugin.ts` | Fixed path-vs-content bug for shell exec, filesystem, timeout detection |
| `packages/core/src/plugins/index.ts` | Added missing exports for sandbox types (DEFAULT_TRUSTED_PLUGINS, PLUGIN_PERMISSIONS, etc.) |
| `scripts/eval.ts` | Removed hardcoded `--plugins security-basic`, changed CLI runner to use `pnpm exec tsx` |
| `apps/cli/tsup.config.ts` | Attempted to fix module bundling — reverted due to playwright conflicts |
| `apps/cli/src/index.ts` | Changed `runAnalysis as coreRunAnalysis` to `runAnalysis` |

---

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Build | `pnpm build` | ✅ Pass |
| TypeScript | `pnpm --filter @turpan/core run build` | ✅ Pass |
| CLI Build | `pnpm --filter @turpan/cli run build` | ✅ Pass |
| Eval | `pnpm eval --fixture python-bot-broad-except-pass` | ❌ Still 0 findings |

---

## Next Steps to Complete Phase 23

1. **Fix CLI findings path**: Ensure CLI writes `TURPAN_FINDINGS.json` to the fixture's `.turpan/runs/latest/` directory
2. **Verify analyzer outputs**: Add debug logging to confirm Python and MCP plugins are producing findings
3. **Run full eval suite**: After fix, run `pnpm eval` to see all fixtures pass
4. **Fix tsup build cache**: Investigate why tsup produces wrong output despite correct source
5. **Write phase report**: Document all changes and validate 0 hard failures

---

## Public Beta Impact

**Current Status**: NOT READY for public beta

**Blocking Issues**:
- Eval suite reports 0 findings for all Python/JS fixtures
- Cannot validate analyzer correctness
- 8 fixtures consistently fail

**Required for Public Beta**:
- [ ] `pnpm eval` must show 0 hard failures
- [ ] All analyzer fixes must be verified
- [ ] CLI findings path must be fixed
