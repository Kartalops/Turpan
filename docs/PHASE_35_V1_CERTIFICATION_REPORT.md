# Phase 35 V1 Certification Report

## Result

NO_GO for V1 certification.

The architecture now has a measurable V1 target and eval standard, but the available local evidence is not sufficient to claim Turpan is a high-quality autonomous review agent across the requested real-world scope.

## What Was Implemented

- `@turpan/evals` package with separated eval concepts:
  - unit
  - integration
  - agent capability
  - review quality
  - runtime
  - browser
  - patch
- Golden review corpus manifest with curated real-defect fixtures.
- Precision, recall, F1, false positive rate, false negative rate metrics.
- Severity and category metric breakdowns.
- Confidence calibration buckets.
- Model strategy benchmarking.
- V1 gate evaluation.
- Prompt injection defense helper that wraps repository text as untrusted data.
- Language capability registry with explicit `evalBacked` flags.
- V1 freeze docs:
  - `docs/V1_ARCHITECTURE.md`
  - `docs/V1_AGENT_PROTOCOL.md`
  - `docs/V1_SECURITY_MODEL.md`
  - `docs/V1_EVAL_STANDARD.md`
  - `docs/V1_PROVIDER_MODEL.md`

## What Turpan Can Reliably Detect

Based on existing targeted tests and fixture coverage, Turpan has evidence for:

- TypeScript/JavaScript project fingerprinting and review primitives.
- Python and FastAPI static/runtime analyzer patterns in existing code.
- MCP unsafe-tool and filesystem-scope patterns.
- UI/runtime exploration primitives.
- CLI probe planning.
- Evidence-backed finding contracts.
- Structured multi-model orchestration contracts.
- Isolated patch experiment contracts.

## What Turpan Cannot Yet Claim

Turpan cannot honestly claim V1-grade support for:

- Go, Rust, Java, or C# real repository review quality.
- Real-world multi-repository benchmark performance.
- Stable calibrated confidence over a large sample.
- Measured model-router superiority.
- Measured ablation value for browser/runtime/verifier/second-model paths.
- Production-grade autonomous patch success rate.
- Patch regression rate over a representative corpus.

## Accuracy

The new eval package can compute accuracy metrics, but this phase did not produce a full real-world benchmark run. Therefore no global precision/recall claim is made.

## Cost

The framework tracks model calls, token usage, and estimated cost. No current run establishes a representative cost baseline.

## Speed

The framework tracks runtime duration, browser actions, and time-to-finding. No current run establishes a representative speed baseline.

## Winning Model Strategies

Not certified. The package can benchmark strategies, but no real provider benchmark was run in this environment.

## Multi-Model Verification

Not certified. It remains architecturally supported, but Phase 35 does not prove that it improves outcomes.

## Browser Execution

Not certified as materially improving recall yet. Phase 33 added the runtime/browser exploration foundation; Phase 35 requires future eval runs to quantify its lift.

## Runtime Reproduction

Not certified as reducing false positives yet. Phase 34 requires reproduction flips for dynamic patch proof, but broader false-positive reduction has not been benchmarked.

## Autonomous Patches

Patch experiments are now isolated and evidence-driven, but patch success/regression rates are not certified without a patch eval corpus run.

## Language Support

Eval-backed today:

- TypeScript/JavaScript
- Python

Capability-described but not V1-claimed:

- Go
- Rust
- Java
- C#

## Features Removed

No deletion was performed in this phase because no benchmark run identified a losing component. The freeze rule now requires future deletions to be driven by eval evidence.

## V1 Readiness

NO_GO.

Turpan has the architecture and measurement foundation for V1 certification, but not the measured evidence required to declare V1 ready.

## Validation

Commands run:

```text
./node_modules/.bin/tsc -p packages/evals/tsconfig.json --noEmit
./node_modules/.bin/vitest run packages/evals/tests/evals.test.ts
./node_modules/.bin/vitest run packages/evals/tests/evals.test.ts packages/fix-engine/tests/self-healing.test.ts packages/core/tests/runtime-exploration.test.ts packages/core/tests/intelligence.test.ts
./node_modules/.bin/vitest run packages/evals/tests/evals.test.ts packages/fix-engine/tests/fix-engine.test.ts packages/fix-engine/tests/self-healing.test.ts packages/core/tests/runtime-exploration.test.ts packages/core/tests/intelligence.test.ts packages/core/tests/architecture-reset.test.ts packages/core/tests/runner.test.ts packages/shared/src/fs/fs.test.ts packages/report/tests/report.test.ts apps/mcp-server/tests/redact.test.ts
npm run lint -- --max-warnings=0
npm run build
```

Results:

- Eval package typecheck passed.
- Phase 35 eval tests passed: 9 tests.
- Phase 32-35 focused tests passed: 4 files, 40 tests.
- Targeted Phase 31-35 regression suite passed: 10 files, 247 tests.
- `npm run lint -- --max-warnings=0` and `npm run build` could not run because the repository scripts delegate to `pnpm`, and `pnpm` was not installed in this environment.
