# Phase 4: Safe Command Runner & Real Build/Test/Lint/Typecheck Execution — Implementation Report

## Summary

Implemented the Safe Command Runner and wired real build, test, lint, typecheck, and install-check execution into the Turpan review pipeline. Commands are now executed safely with log capture, secret redaction, timeout enforcement, and structured failure findings.

## What Was Built

### Runner Core (`packages/core/src/runner/`)

| File | Purpose |
|------|---------|
| `CommandPolicy.ts` | DANGEROUS_PATTERNS blocklist (18 patterns), allowlist models (21 types), `checkDangerousPatterns`, `validateScript`, `detectPackageManager` |
| `LogRedactor.ts` | Redacts 30+ secret patterns: env vars, Bearer tokens, Stripe/ GitHub/NPM/Cypress keys, AWS credentials, JWT, private keys, URLs with embedded creds |
| `ProcessTimeout.ts` | `runWithTimeout`, `waitForExit`, `ProcessTimeoutError` — graceful then hard kill |
| `CommandResult.ts` | `CommandResult`, `CommandRunOptions`, `CommandSummary`, `STAGE_SEVERITY` map |
| `SafeCommandRunner.ts` | Main class: `run()`, `runScript()`, `checkPolicy()`, `summarize()`, `getLogDir()` — never shells out, always saves logs |
| `index.ts` | Re-exports all runner types and utilities |

### Stage Implementations (`packages/core/src/runner/stages/`)

| File | Behavior |
|------|---------|
| `installCheck.ts` | No auto-install by default; if `node_modules` missing → high finding requiring install; `--install` flag triggers real install; blocked/failed installs produce findings |
| `scriptDetection.ts` | Checks for missing build/test scripts (medium findings); validates all scripts against policy (blocks dangerous ones with high/critical findings); flags empty scripts (low) |
| `buildStage.ts` | Runs detected build commands via `SafeCommandRunner`; `critical` finding on non-zero exit; `high` on timeout or policy block |
| `testStage.ts` | Runs detected test commands; `critical` if actual failing tests found, `high` if non-zero without test failures; `high` on timeout/block |
| `lintStage.ts` | Runs detected lint commands; `medium` finding on non-zero exit (default); `medium` on timeout/block |
| `typecheckStage.ts` | Tries detected typecheck commands first, falls back to `tsc --noEmit` if `tsconfig.json` found; `high` finding on type errors; skips gracefully if no TypeScript |

### Orchestrator Wiring

- `OrchestratorConfig` extended with: `install`, `timeoutMs`, `skipBuild`, `skipTests`, `skipLint`, `skipTypecheck`
- `STAGE_REGISTRY` updated: `install-check`, `script-detection`, `build`, `test`, `lint`, `typecheck` now use real implementations
- `runAnalysis` / `OrchestratorOptions` extended with all new CLI options

### CLI Changes (`apps/cli/src/index.ts`)

New `turpan review` flags:
- `--install` — run install before review
- `--timeout <seconds>` — per-command timeout (default 120s)
- `--skip-build` / `--skip-tests` / `--skip-lint` / `--skip-typecheck`

Interactive shell routes:
- `run build` / `run tests` / `run lint` / `run typecheck` → runs only that stage
- `review build quality` → runs full non-deep review

## Design Principles

1. **Never shell out** — `shell: false` always; prevents injection
2. **Policy before execution** — every command checked against dangerous patterns
3. **Secrets never logged** — `LogRedactor` scrubs 30+ secret patterns before writing logs
4. **Logs saved** — `.turpan/runs/latest/logs/<stage>_<timestamp>.log`
5. **Timeouts enforced** — graceful kill with 5s grace period, then SIGKILL
6. **Non-zero = failure** — always produces a Finding with evidence
7. **Blocked = high/critical** — policy violations get severity-appropriate findings

## Validation

```
pnpm -r run build          ✅ Pass (shared, core, cli)
cd packages/core && vitest run   ✅ 137 tests pass (72 pre-existing + 65 new runner tests)
turpan review . --plan     ✅ Shows correct 7-stage plan
```

### Test Coverage (137 total)

| Suite | Tests | Coverage |
|-------|-------|----------|
| `orchestrator.test.ts` | 36 | Score, verdict, ReviewPlan generation |
| `fingerprint.test.ts` | 36 | All fingerprint detectors |
| `runner.test.ts` | 65 | LogRedactor (15), CommandPolicy (24), SafeCommandRunner (26) |

Key runner test categories:
- **LogRedactor**: env-var redaction, Bearer tokens, AWS keys, GitHub tokens, JWT, URLs with creds, multi-line, object redaction, non-sensitive vars passthrough
- **CommandPolicy**: 20 dangerous command cases (blocks/allows), pattern count, script validation (safe/dangerous/matched model)
- **SafeCommandRunner**: policy checks (allows/blocks), real echo/stdin/exit-code/timeout, missing commands, log saving

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/runner/CommandPolicy.ts` | New — blocklist, allowlist models, validation |
| `packages/core/src/runner/LogRedactor.ts` | New — secret redaction engine |
| `packages/core/src/runner/ProcessTimeout.ts` | New — timeout wrapper |
| `packages/core/src/runner/CommandResult.ts` | New — result types |
| `packages/core/src/runner/SafeCommandRunner.ts` | New — main runner class |
| `packages/core/src/runner/index.ts` | New — re-exports |
| `packages/core/src/runner/stages/installCheck.ts` | New — install check stage |
| `packages/core/src/runner/stages/scriptDetection.ts` | New — script validation stage |
| `packages/core/src/runner/stages/buildStage.ts` | New — build stage |
| `packages/core/src/runner/stages/testStage.ts` | New — test stage |
| `packages/core/src/runner/stages/lintStage.ts` | New — lint stage |
| `packages/core/src/runner/stages/typecheckStage.ts` | New — typecheck stage |
| `packages/core/src/runner/stages/index.ts` | New — stage exports |
| `packages/core/src/orchestrator/ReviewOrchestrator.ts` | Updated — real stage registry, new config options |
| `packages/core/src/orchestrator/index.ts` | Updated — `OrchestratorOptions` extended, `runAnalysis` passes new options |
| `packages/core/src/index.ts` | Updated — runner types re-exported |
| `packages/core/tests/runner.test.ts` | New — 65 tests |
| `apps/cli/src/index.ts` | Updated — new CLI flags, interactive shell routing |

## Next Steps (Next Phase)

- [ ] Implement `static-quality` — grep for TODO/FIXME, console.log, any-typed values
- [ ] Implement `security-basic` — check for hardcoded secrets, known vulnerable patterns
- [ ] Implement `dead-code-basic` — detect unused exports with build tool analysis
- [ ] Implement `ui-live-basic` — Playwright smoke test runner (requires browser setup)
- [ ] Python-specific stages — detect and run pytest, pip check, etc.
- [ ] Command summary table in report output
- [ ] Failed command excerpts in report
- [ ] Log file linking as evidence

## Final Verdict

**READY** — Safe Command Runner fully implemented and tested:
- ✅ `SafeCommandRunner` executes commands safely, captures stdout/stderr, saves redacted logs
- ✅ 18 dangerous patterns blocked (critical + high)
- ✅ 21 allowlist command models supported
- ✅ `LogRedactor` scrubs 30+ secret patterns
- ✅ `install-check` — no auto-install by default, `--install` flag available
- ✅ `build`, `test`, `lint`, `typecheck` — real execution with structured findings
- ✅ CLI: `--install`, `--timeout`, `--skip-*` flags all wired
- ✅ Interactive shell: `run build`, `run tests`, `run lint`, `run typecheck`, `review build quality`
- ✅ 137 tests pass (65 new runner tests)
- ✅ Clean build across all packages
