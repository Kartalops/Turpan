# Phase 32 Multi-Model Intelligence Report

Date: August 15, 2026

## Outcome

Turpan now has a provider-neutral model intelligence foundation that can route work across multiple model descriptors, run specialist review workers, require adversarial verification, compute evidence-weighted confidence, enforce model budgets, redact outbound context, and support offline-only policy mode.

This phase does not replace deterministic analyzers. The implementation follows the rule:

> Models reason. Tools prove.

No autonomous code modification was added.

## Implemented Architecture

### Provider-neutral model layer

Implemented in:

- `packages/core/src/intelligence/types.ts`
- `packages/core/src/intelligence/Providers.ts`
- `packages/core/src/intelligence/ModelProviderRunner.ts`
- `packages/core/src/protocol/index.ts`

Core contracts:

- `ModelProvider`
- `ModelRequest`
- `ModelResponse`
- `ModelCapabilities`
- `ModelDescriptor`
- `ProviderHealth`

The review intelligence layer depends on provider capabilities rather than provider-specific model names. Provider adapters use injected transports, so OpenAI-compatible, Anthropic-compatible, Google-compatible, local, or future providers can be wired without putting provider-specific logic into the review engine.

### Model registry

Implemented in:

- `packages/core/src/intelligence/ModelRegistry.ts`

The registry stores model descriptors with capability metadata:

- coding reasoning
- architecture reasoning
- security reasoning
- long context
- tool use
- vision
- latency class
- cost class
- context window
- structured output
- reliability score

The default registry includes representative provider families:

- `local/local-structured-reviewer`
- `openai-compatible/cheap-fast`
- `openai-compatible/strong-coding`
- `anthropic-compatible/strong-reasoning`
- `google-compatible/vision-reviewer`

These are capability descriptors, not hardcoded review decisions.

### Intelligent model router

Implemented in:

- `packages/core/src/intelligence/ModelRouter.ts`

The router scores models from task requirements:

- task type
- risk level
- repository languages
- changed surface
- required context size
- vision needs
- browser artifacts
- prior confidence
- budget
- latency preference
- available providers

Tests prove:

- cheap file-classification routes to cheap/fast models
- high-risk architecture routes to reasoning-family models
- UI evidence routes to vision-capable models

### Review specialists

Implemented in:

- `packages/core/src/intelligence/Specialists.ts`

Supported specialist roles:

- `RepoMapper`
- `SecurityReviewer`
- `CorrectnessReviewer`
- `ArchitectureReviewer`
- `TestReviewer`
- `DependencyReviewer`
- `RuntimeReviewer`
- `UIReviewer`

Specialists receive scoped context, have explicit goals, return structured finding candidates, and cannot declare final verdicts or modify code. Independent jobs can run concurrently with `runConcurrent()`.

### Adversarial verification

Implemented in:

- `packages/core/src/intelligence/AdversarialVerifier.ts`

The verifier prompt is explicitly adversarial:

> Assume this finding may be wrong. Try to disprove it.

Verifier output status:

- `CONFIRMED`
- `REJECTED`
- `NEEDS_EVIDENCE`

Tests prove a verifier can reject a false finding.

### Evidence-weighted consensus

Implemented in:

- `packages/core/src/intelligence/ConsensusEngine.ts`

Confidence weighs:

- runtime reproduction
- compiler/typechecker evidence
- test failure
- browser reproduction
- deterministic static evidence
- independent model agreement
- source location quality
- reproducibility
- adversarial verification status

Critical or high findings with only model opinion are capped below maximum confidence.

### Structured output handling

Implemented in:

- `packages/core/src/intelligence/StructuredOutput.ts`

Model output must validate against an explicit validator. Invalid output can be repaired once; if repair fails, the operation remains failed. Missing fields are not invented.

### Context engine

Implemented in:

- `packages/core/src/intelligence/ContextEngine.ts`

The context engine selects scoped context from:

- repository map
- changed files
- tests
- config files
- recent findings

It estimates token use, respects a token budget, hashes selected context, caches summaries by content hash, and redacts secrets before provider calls.

### Cost and latency control

Implemented in:

- `packages/core/src/intelligence/ModelPolicy.ts`
- `packages/core/src/intelligence/ModelProviderRunner.ts`

Profiles:

- `fast`
- `balanced`
- `deep`
- `paranoid`

Controls:

- maximum model calls
- maximum estimated cost
- timeout
- fallback model
- provider circuit breaker

Tests prove cost limits stop model calls.

### Failure tolerance

Implemented in:

- `packages/core/src/intelligence/ModelProviderRunner.ts`

Behavior:

- provider timeout
- bounded call budget
- fallback model
- provider circuit breaker
- budget exhaustion errors

Tests prove primary-provider failure falls back to another provider.

### Privacy policy

Implemented in:

- `packages/core/src/intelligence/PrivacyPolicy.ts`

Default policy:

- `offline-only`
- source exfiltration disclosure enabled
- secret redaction enabled
- only `local` provider allowed

Remote calls require explicit policy allowing remote providers. Tests prove remote provider calls are blocked by default and secrets are redacted before provider invocation.

## Tests Added

Added:

- `packages/core/tests/intelligence.test.ts`

Covered requirements:

- router selects models by task
- cheap tasks avoid expensive models
- provider failure falls back
- malformed structured output is rejected after repair fails
- specialists run concurrently
- model findings require adversarial verification path
- verifier can reject false findings
- model-only confidence is capped
- cost limits stop further calls
- context is scoped
- secrets are redacted before provider calls
- offline privacy policy blocks remote providers
- budget profiles exist

Updated:

- `packages/core/tests/architecture-reset.test.ts`
  The serializable protocol test now uses the Phase 32 review mode value `fast`.

## Verification

Passed on August 15, 2026:

- `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc -p packages/shared/tsconfig.json --noEmit`
- targeted Vitest suite: `173` tests passed

Targeted test command included:

- `packages/core/tests/intelligence.test.ts`
- `packages/core/tests/architecture-reset.test.ts`
- `packages/core/tests/runner.test.ts`
- `packages/shared/src/fs/fs.test.ts`
- `packages/report/tests/report.test.ts`
- `apps/mcp-server/tests/redact.test.ts`

Not completed in this environment:

- full `pnpm install`
- full workspace `pnpm lint`
- full workspace `pnpm build`
- full workspace `pnpm test`
- evals
- CLI smoke tests
- MCP smoke tests

Reason:

- `pnpm` is not available on PATH.
- `corepack pnpm` previously attempted a network fetch and failed because `registry.npmjs.org` was unreachable from this environment.
- full workspace TypeScript project references still have pre-existing `composite` configuration issues outside the Phase 32 intelligence layer.

## Exit Criteria Status

Completed:

- multiple providers can be registered
- different models can be selected within one review plan
- routing is capability-based
- specialists can run concurrently
- findings can be adversarially challenged
- confidence accounts for evidence quality
- provider fallback exists
- cost controls exist
- structured output validation exists
- default offline privacy policy exists

Partial:

- provider SDK adapters are represented by provider-neutral configured transports, not concrete vendor SDK clients
- degraded-mode reporting exists at the model-runner level, but is not yet wired into the full CLI report
- context selection is implemented, but import graph/call graph integration is still future work

Not added:

- autonomous code changes
- provider-specific logic in the review engine
- naive majority voting

## Next Work

Recommended follow-up work:

1. Wire `SpecialistRunner`, `AdversarialVerifier`, and `ConsensusEngine` into `ReviewOrchestrator` behind an opt-in model policy.
2. Add real provider adapter packages or config modules outside `core`.
3. Extend `ContextEngine` with import graph, call graph, route relationship, and test relationship discovery.
4. Render degraded model-provider state in `@turpan/report`.
5. Add CLI/config profile support after the API settles, avoiding option sprawl.
