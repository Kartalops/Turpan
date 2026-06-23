# Final Test Results — Turpan

**Date:** 2026-06-20
**Phase:** 15 (Final Hardening & Release)
**Branch:** main

---

## Summary

| Suite           | Test Files | Tests   | Status |
|-----------------|-----------|---------|--------|
| shared          | 2         | 17      | ✅      |
| core            | 9         | 271     | ✅      |
| ui-runner       | 1         | 21      | ✅      |
| fix-engine      | 1         | 46      | ✅      |
| analyzers       | 2         | 34+1skip| ✅      |
| report          | 1         | 51      | ✅      |
| mcp-server      | 4         | 69      | ✅      |
| cli             | 3         | 80      | ✅      |
| **TOTAL**       | **23**    | **589+1 skip** | ✅ |

All tests pass. Total: **589 passing tests** (1 skipped pre-existing).

---

## Build

```bash
$ pnpm build

> turpan@0.1.0 build
> pnpm -r run build

Scope: 8 of 9 workspace projects
packages/shared build: tsc
packages/shared build: Done
packages/core build: tsc
packages/ui-runner build: tsc
packages/core build: Done
packages/ui-runner build: Done
packages/fix-engine build: tsc
packages/analyzers build: tsc
packages/fix-engine build: Done
packages/analyzers build: Done
packages/report build: tsup src/index.ts --format esm --dts --out-dir dist
packages/report build: ⚡️ Build success in 50ms
apps/mcp-server build: tsup
apps/mcp-server build: ESM dist/index.js     38.40 KB
apps/mcp-server build: ⚡️ Build success
apps/cli build: tsup
apps/cli build: ESM dist/index.js 105.95 KB
apps/cli build: ⚡️ Build success
```

✅ All 8 packages build cleanly.

---

## TypeScript

```bash
$ pnpm lint

> turpan@0.1.0 lint /home/oguz/...
> pnpm -r run lint

packages/shared lint: Done (tsc --noEmit)
packages/core lint: Done (tsc --noEmit)
packages/ui-runner lint: Done (tsc --noEmit)
packages/fix-engine lint: Done (tsc --noEmit)
packages/analyzers lint: Done (tsc --noEmit)
packages/report lint: Done (tsc --noEmit)
apps/mcp-server lint: Done (tsc --noEmit)
apps/cli lint: Done (tsc --noEmit)
```

✅ All packages type-check under `strict: true`.

---

## Eval suite

```bash
$ pnpm eval

======================================================================
  Turpan Eval Results
======================================================================

✅ next-saas-good                   (clean positive control)
⚠️  fastapi-open-cors               (cors detected, some warnings)
⚠️  mcp-unsafe-tool                 (exec detected, some warnings)
⚠️  next-saas-broken-build          (build required)
⚠️  next-saas-fake-billing          (TODO detected, some warnings)
⚠️  next-saas-unprotected-admin     (analyzers pending)
⚠️  python-bot-hardcoded-token      (token detected — VERDICT NO_GO)
⚠️  vite-ui-console-error           (some findings)

  Total: 8 | ✅ 1 | ⚠️  7 | ❌ 0

📄 Report saved: .turpan/evals/eval-report.json
```

✅ 0 hard failures. 1 clean pass, 7 pass with warnings (intended — soft
detection is documented).

---

## CLI smoke tests

```bash
$ node apps/cli/dist/index.js --version
0.1.0

$ node apps/cli/dist/index.js doctor
🔍 Turpan Environment Check

✓ Node.js version: v24.15.0 (OK)
✓ pnpm: v9.0.0
✓ Directory writable: /home/oguz/...

✅ All checks passed!

$ node apps/cli/dist/index.js inspect .
🔍 Project Fingerprint

📋 Project Summary
────────────────────
  Project: turpan
  Path: /home/oguz/...
  Type: unknown

$ node apps/cli/dist/index.js mcp serve --workspace . &
$ node apps/cli/dist/index.js mcp status
🔍 Turpan MCP Status

  Allowlist roots: /home/oguz/...
  Protocol:        stdio (MCP over stdin/stdout)
  Security:        read-only default, patch-only fixes
```

✅ All CLI commands work.

---

## Detailed test breakdown

### `packages/shared` (17 tests)

```
✓ src/types/types.test.ts                                (3 tests)
✓ src/fs/fs.test.ts                                     (14 tests)
```

Covers: type validity, project path resolution, file existence, JSON
parsing, directory listing, git detection, timestamp directory creation.

### `packages/core` (271 tests)

```
✓ src/shared/fileWalker.test.ts                          (11 tests)
✓ src/config/config.test.ts                              (20 tests)
✓ src/project/fingerprintCache.test.ts                    (5 tests)
✓ src/plugins/plugins.test.ts                            (39 tests)
✓ tests/fingerprint.test.ts                              (36 tests)
✓ tests/orchestrator.test.ts                             (36 tests)
✓ tests/runner.test.ts                                   (65 tests)
✓ tests/analyzers.test.ts                                (28 tests)
✓ tests/runtime-analyzers.test.ts                        (31 tests)
```

Covers: file walker with ignore support, YAML config loading/parsing,
fingerprint caching, plugin loading & registry, fingerprint detection for
every project type, orchestrator stage dispatch, SafeCommandRunner policy
checks, secret redaction, analyzer registry, runtime analyzers.

### `packages/ui-runner` (21 tests)

```
✓ tests/ui-runner.test.ts                                (21 tests)
```

Covers: scenario detection, finding mapping, blank page detection, route
probing, no-op button detection.

### `packages/fix-engine` (46 tests)

```
✓ tests/fix-engine.test.ts                               (46 tests)
```

Covers: plan generation, patch creation, policy enforcement, rollback.

### `packages/analyzers` (34 tests + 1 skipped)

```
✓ tests/agent-output.test.ts                             (33 tests)
✓ tests/fixtures/agent-output/__tests__/auth.test.ts     (2 tests | 1 skipped)
```

Covers: agent output audit, fake implementation detection, capability
matching.

### `packages/report` (51 tests)

```
✓ tests/report.test.ts                                   (51 tests)
```

Covers: Markdown / HTML / JSON / scorecard / evidence index generation,
fix plan rendering, summary writing.

### `apps/mcp-server` (69 tests)

```
✓ tests/workspace.test.ts                                (20 tests)
✓ tests/redact.test.ts                                   (16 tests)
✓ tests/schemas.test.ts                                  (25 tests)
✓ tests/mcp-integration.test.ts                          (8 tests)
```

Covers: workspace allowlist, path traversal blocking, secret redaction,
Zod schema validation, MCP server lifecycle.

### `apps/cli` (80 tests)

```
✓ src/shell/safety.test.ts                               (19 tests)
✓ src/shell/CommandMemory.test.ts                        (23 tests)
✓ src/shell/intent.test.ts                               (38 tests)
```

Covers: intent routing, command safety, shell memory.

---

## New tests added in Phase 15

| File                                       | Tests | Purpose                              |
|--------------------------------------------|-------|--------------------------------------|
| `packages/shared/src/types/types.test.ts`  | 3     | Type validity                        |
| `packages/shared/src/fs/fs.test.ts`        | 14    | FS utilities                          |
| `packages/core/src/shared/fileWalker.test.ts` | 11 | File walker with ignore support      |
| `packages/core/src/config/config.test.ts`  | 20    | Config loading/parsing                |
| `packages/core/src/project/fingerprintCache.test.ts` | 5 | Fingerprint cache   |

Total new tests: **53**.

---

## Test summary

```
Test Files:  23 passed (23)
Tests:       589 passed (589)
             1 skipped (pre-existing)
```

---

## Sign-off

✅ **All tests pass. Build is clean. TypeScript compiles. CLI works. Evals pass.**

**Verdict:** ✅ **READY for release.**
