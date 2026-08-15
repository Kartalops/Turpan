# Language Architecture Decision

Date: August 15, 2026

## Decision

Turpan should remain TypeScript-first.

Recommended architecture:

- TypeScript control plane
- Optional Rust worker only if a measured parsing or execution bottleneck appears later

No rewrite is justified in Phase 31.

## Actual Requirements

Turpan’s current product surface is dominated by:

- orchestration
- subprocess control
- filesystem inspection
- git diff parsing
- Playwright/browser automation
- MCP server integration
- AST/text heuristics
- report generation
- plugin/runtime isolation glue

These are integration-heavy concerns, not CPU-bound compute kernels.

## Comparison

### TypeScript

Strengths:

- best fit for current codebase and tests
- native fit for Node subprocess control and filesystem work
- first-class Playwright ecosystem
- strong MCP and JavaScript tool SDK availability
- easy structured JSON/protocol work
- low integration friction with existing packages

Weaknesses:

- startup cost higher than Go or Rust binaries
- weaker isolation story unless explicitly implemented
- easier to accumulate type/system sprawl, which this repo already shows

Assessment:

- Best control-plane language for Turpan today.

### Rust

Strengths:

- excellent subprocess and resource-control primitives
- strong memory and latency characteristics
- best option for sandbox workers or parsing-heavy helpers

Weaknesses:

- weaker Playwright/browser story for Turpan’s current product shape
- much higher integration and maintenance cost for orchestration-heavy code
- would split team/tooling focus immediately

Assessment:

- Good optional worker language, not the right control-plane rewrite target.

### Go

Strengths:

- simple deployment story
- good concurrency and subprocess ergonomics
- faster startup than Node

Weaknesses:

- thinner ecosystem for Turpan’s current browser + JS/TS-focused tooling needs
- less leverage from existing TypeScript analyzers and fixtures
- would still require large adapter rewrites

Assessment:

- Reasonable systems language, but not a compelling enough upgrade over current needs.

### Python

Strengths:

- broad AI/provider SDK availability
- good for experiments and text/AST tooling in some domains

Weaknesses:

- weaker fit for existing Node/Playwright/MCP stack
- packaging/distribution story less attractive for a cross-platform CLI agent
- mixed-runtime orchestration burden would increase, not decrease

Assessment:

- Useful integration target, not a suitable primary runtime for this repo.

## Requirement-by-Requirement Verdict

- Agent orchestration: TypeScript wins on lowest migration cost.
- Subprocess control: Rust best raw capability, TypeScript already sufficient.
- MCP: TypeScript has the best current leverage.
- Playwright/browser automation: TypeScript wins decisively.
- AST ecosystem: TypeScript strong for JS/TS; mixed for others.
- LSP integration: TypeScript/Node is already well-positioned.
- Startup latency: Go/Rust better, but not enough to justify rewrite.
- Memory: Rust/Go better, but no measured bottleneck is documented.
- Binary distribution: Go/Rust better; current CLI does not yet justify rewrite cost.
- Cross-platform support: TypeScript and Go both workable; existing repo already Node-based.
- Plugin ecosystem: TypeScript wins given current local plugin model.
- Provider SDK availability: TypeScript and Python strongest; TypeScript already integrated.
- Concurrency: Go/Rust better, but current workloads are I/O dominated.
- Security isolation: Rust process workers are attractive for future hotspots.

## Measured Evidence Available Today

What is measured:

- current architecture pain is conceptual duplication, not CPU saturation
- browser, diff, report, and orchestration subsystems are integration-heavy
- there is no benchmark in this repo showing TypeScript is the throughput bottleneck

What is not measured:

- CPU hot paths demanding native rewrite
- memory ceilings requiring language migration
- startup latency budgets that Node cannot meet

## Conclusion

Remain TypeScript-only for the control plane in the near term.

Allow one exception:

- introduce an optional Rust worker only when one subsystem is proven to be a stable bottleneck and can be isolated cleanly behind the protocol introduced in `packages/core/src/protocol/index.ts`.
