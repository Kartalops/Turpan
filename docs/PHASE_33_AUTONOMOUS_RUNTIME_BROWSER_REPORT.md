# Phase 33 Autonomous Runtime Browser Report

## Scope

Phase 33 adds the minimal runtime exploration foundation needed for Turpan to review software by running and observing it. The implementation keeps deterministic execution policy as the boundary: runtime and browser behavior can produce evidence, but no model or worker is allowed to perform autonomous code changes.

## What Was Added

- `RuntimeSupervisor` owns all launched resources for a review run: child processes, dev servers, ports, browser sessions, temp directories, worktrees, and environment resources. Cleanup is centralized, ordered, and evented so resources are not left orphaned.
- `BootDiscovery` infers ranked boot candidates from project files such as `package.json`, lockfiles, Docker Compose, Makefile, Python files, and README content. It only proposes commands and filters dangerous scripts; it does not execute arbitrary commands.
- `HealthDetector` detects readiness from stdout readiness patterns, process liveness, ports, and HTTP probes. The primitive is signal-based instead of fixed-sleep based.
- `BrowserAgent` explores semantic browser observations through `openPage`, `inspectPage`, `click`, `type`, `select`, `submit`, `back`, `reload`, `waitFor`, console reads, network reads, screenshots, and accessibility-tree access through a provider-neutral `SemanticBrowser` interface.
- `SafeExplorationPolicy` classifies UI actions as `SAFE`, `REVIEW_REQUIRED`, or `FORBIDDEN` using accessible name, route context, nearby text, form actions, destinations, destructive hints, external-write hints, and optional model classification.
- `BrowserAgent` builds a bounded UI state graph with visited routes, transitions, console failures, network failures, screenshots, and loop prevention.
- `ReproductionPlanner` creates concrete runtime reproduction strategies for suspected UI persistence/no-op bugs and authorization exposure bugs.
- `ApiAgent` discovers local API surfaces from Next.js route handlers and Express-style route definitions, marking only safe read/test calls as executable by default.
- `CliAgent` defines safe CLI probes for `--help`, `--version`, invalid options, and missing-argument behavior to close the broken-help detection gap.
- `RuntimeCorrelator` maps runtime evidence back to likely source files and emits source-linked evidence.
- `ArtifactBuilder` sanitizes reproduction artifacts, command history, screenshots, network evidence, console evidence, logs, source locations, and environment metadata before persistence.

## Runtime Review Flow

1. `BootDiscovery` ranks candidate startup commands from repository evidence.
2. Existing command safety policy gates any candidate before execution.
3. `RuntimeSupervisor` owns every resource launched for the `ReviewRun`.
4. `HealthDetector` waits for readiness using observable signals.
5. Runtime workers collect browser, API, CLI, logs, console, network, and screenshot evidence.
6. `ReproductionPlanner` turns suspected findings into bounded reproduction strategies.
7. `RuntimeCorrelator` links runtime failures to source files where possible.
8. `ArtifactBuilder` redacts secrets and produces serializable runtime artifacts.
9. Confirmed evidence can back `FindingCandidate` verification without allowing autonomous code mutation.

## Safety Boundaries

- Runtime discovery proposes commands only; it does not run them.
- UI exploration executes only `SAFE` actions automatically.
- Persistent writes, email sends, external API writes, publishing, and similar side effects are `REVIEW_REQUIRED`.
- Delete, purge, account deletion, credential rotation, production deployment, real purchases, and financial actions are `FORBIDDEN` by default.
- API review marks non-GET endpoints unsafe to call by default.
- Artifact generation redacts secrets before saving runtime evidence.

## Eval Gap Coverage

The new primitives directly target the known runtime/browser gaps:

- Broken authenticated login can be reproduced through browser state graph traversal, console/network capture, and source correlation.
- Exposed admin routes can be tested through unauthenticated route probes and bounded retry strategies.
- Fake billing success is guarded by forbidden/review-required action classification.
- No-op buttons and no-op settings saves get explicit persistence reproduction plans.
- Empty dashboard behavior can be captured through semantic page inspection and screenshot artifacts.
- Broken CLI help is covered by safe CLI probe planning.
- Unwired UI components can be observed through action transitions, network silence, console failures, and runtime-source correlation.

No fixture names are special-cased.

## Tests Added

`packages/core/tests/runtime-exploration.test.ts` verifies:

- supervisor cleanup ownership and reverse-order cleanup
- boot command ranking and dangerous-script exclusion
- signal-based health readiness
- UI action risk classification
- bounded semantic browser exploration
- unsafe action skipping
- runtime reproduction strategy generation
- API endpoint discovery and safe-call classification
- CLI probe planning
- runtime-source correlation
- artifact secret redaction

## Validation

Commands run:

```text
./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
./node_modules/.bin/vitest run packages/core/tests/runtime-exploration.test.ts
./node_modules/.bin/vitest run packages/core/tests/runtime-exploration.test.ts packages/core/tests/intelligence.test.ts packages/core/tests/architecture-reset.test.ts packages/core/tests/runner.test.ts packages/shared/src/fs/fs.test.ts packages/report/tests/report.test.ts apps/mcp-server/tests/redact.test.ts
./node_modules/.bin/vitest run
```

Results:

- Core typecheck passed.
- Phase 33 runtime exploration tests passed: 10 tests.
- Targeted regression suite passed: 7 files, 183 tests.
- Full direct Vitest run did not pass: 32 files passed, 3 files failed. Failures were in pre-existing analyzer fixture expectations (`packages/core/tests/analyzers.test.ts`, `packages/core/tests/runtime-analyzers.test.ts`) and process sandbox timeout tests (`packages/core/src/plugins/sandbox/processSandbox.test.ts`), outside the Phase 33 runtime exploration files.
- `npm run lint -- --max-warnings=0` and `npm run build` could not run because the repository scripts delegate to `pnpm`, and `pnpm` was not installed in this environment.

## Known Limits

- This phase adds the execution and exploration contracts plus deterministic core behavior. It does not yet wire the browser agent into a live Playwright implementation.
- It does not start applications automatically without policy approval.
- It does not implement autonomous code changes.
- Full repository lint/build/integration/eval runs were not completed in this phase report unless separately recorded by CI or a later local run.
