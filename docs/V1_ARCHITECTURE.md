# V1 Architecture

## Status

V1 architecture is frozen as a target architecture, not certified as production-ready until the V1 eval gates pass.

## Principle

Turpan is a small orchestration core around deterministic tools, runtime evidence, model reasoning, and isolated patch experiments.

Models reason. Tools prove.

## Major Components

- CLI adapter: thin command-line entrypoint.
- MCP adapter: thin protocol entrypoint.
- Core review engine: owns review requests, tasks, findings, evidence, verdicts, runtime primitives, and model orchestration contracts.
- Runtime layer: owns command execution, boot discovery, readiness checks, browser exploration contracts, API/CLI review workers, source-runtime correlation, and artifact redaction.
- Intelligence layer: owns provider-neutral model requests, model registry, routing, specialists, structured output validation, context selection, consensus, privacy policy, and adversarial verification.
- Fix engine: owns fix eligibility, minimal patch candidates, isolated worktree experiments, regression test guardrails, adversarial patch review, scoring, and patch evidence reports.
- Eval package: owns golden corpus definitions, quality metrics, calibration, strategy benchmarking, language capability declarations, prompt-injection handling, and V1 gates.
- Report package: consumes structured review/fix/eval outputs and renders artifacts.

## Dependency Direction

```text
apps/cli ─┐
apps/mcp ─┼──> packages/core ───> packages/shared
          │
          ├──> packages/report
          ├──> packages/fix-engine ───> packages/core
          └──> packages/evals

packages/ui-runner ───> packages/core
packages/dependency-audit ───> packages/core/shared types where needed
packages/diff-analyzers ───> package-local types
```

The review engine must not import CLI or MCP implementation details.

## Extension Points

- Model providers implement provider-neutral capability contracts.
- Language support is added through `LanguageCapability` adapters, not review-supervisor branching.
- Runtime tools implement semantic interfaces such as browser, API, CLI, and command execution primitives.
- Fix generation may produce patch candidates, but patch acceptance requires isolated experiment evidence.
- Reports consume structured results and must not inspect internal engine classes.

## Freeze Rule

After this point, foundational rewrites require eval evidence showing that the current architecture blocks quality gates.
