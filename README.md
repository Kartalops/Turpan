# Turpan

Turpan is an evidence-driven autonomous software review agent for TypeScript/JavaScript and Python projects.

Project status: **V1 NOT YET CERTIFIED**.

## Why Turpan

Turpan is built around one rule:

```text
Models reason. Tools prove.
```

It does not simply ask an LLM to review a repository. The review loop combines deterministic analysis, model reasoning contracts, runtime/browser evidence, adversarial verification, and isolated patch experiments. The technical release gates pass; V1 quality certification remains blocked by insufficient benchmark and calibration samples.

## What It Does Today

Current validated paths:

- Project fingerprinting and deterministic analyzers.
- Static and diff-scoped review primitives.
- Dependency/SBOM review package.
- MCP server adapter with workspace/security controls.
- Playwright-based UI runner with a verified local Chromium smoke path.
- Provider-neutral model intelligence contracts, router, specialists, verifier, and consensus primitives.
- Isolated patch experiment framework with a verified temporary Git worktree smoke path.
- V1 eval package with golden corpus definitions, metrics, calibration buckets, strategy benchmarking, prompt-injection defense, and release gates.

Important limitation: live provider benchmarks, precision/calibration, and representative patch-rate metrics are not yet certified.

## Core Commands

Use the repository package manager through Corepack:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm -r run lint
corepack pnpm eval -- --hard-fail
```

Built CLI smoke command:

```bash
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js review . --deep
node apps/cli/dist/index.js review-diff . --base main --target HEAD
node apps/cli/dist/index.js fix .
```

Built MCP smoke command:

```bash
node apps/mcp-server/dist/index.js --help
```

## Review Modes

The CLI exposes review flags for quick/deep review, UI/runtime checks, dependency audit, plugins, and diff review. Treat mode behavior as implementation-defined until V1 certification passes.

## Multi-Model Support

Turpan has provider-neutral model contracts, model descriptors, routing, specialist review roles, structured output validation, adversarial verification, and evidence-weighted consensus primitives.

Provider-specific production adapters and real provider benchmark results are not yet certified. Source-code transmission to remote providers must remain explicit policy. Local/offline mode is part of the privacy model.

## Runtime & Browser Review

Turpan includes:

- boot discovery contracts
- runtime supervisor contracts
- health detection
- semantic browser-agent contracts
- safe UI action classification
- API and CLI review workers
- runtime-to-source correlation

The current V1 gate still requires real end-to-end browser/runtime eval proof before release certification.

## Verified Fixes

The fix engine supports isolated patch experiment primitives:

```text
verified finding
-> fix eligibility
-> patch candidate
-> patch budget
-> temporary worktree
-> validation
-> reproduction flip
-> adversarial patch review
-> patch evidence report
```

The active working tree is read-only by default. Autonomous patch application to the user's working tree is not silently enabled.

## Evidence Model

Turpan distinguishes:

```text
FindingCandidate -> Evidence -> VerificationResult -> Finding
```

Findings must be backed by evidence. Confidence is expected to be calibrated through eval buckets, not arbitrary labels.

## Supported Languages

Eval-backed in the current corpus:

- TypeScript/JavaScript
- Python

Capability-described but not V1-claimed:

- Go
- Rust
- Java
- C#

Do not treat syntax detection as full language support.

## Security

Current security model:

- read-only default
- command safety policy
- workspace-scoped MCP controls
- secret redaction
- provider privacy policy
- prompt-injection defense for repository text
- UI action safety policy
- isolated worktree patch experiments

See [docs/V1_SECURITY_MODEL.md](docs/V1_SECURITY_MODEL.md).

## Benchmarks / Evaluation

Latest local certification attempt:

- Install: passed with `corepack pnpm install --frozen-lockfile`.
- Build: passed with `corepack pnpm -r run build`.
- Lint/typecheck: passed with `corepack pnpm -r run lint`.
- Tests: passed (906 active tests) with `corepack pnpm -r run test`.
- Agent eval: passed, 22 fixtures run, 22 pass.
- CLI smoke: passed.
- MCP smoke: passed.

V1 gate decision: **V1_RC_NO_GO**.

See [docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md](docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md).

## Architecture

```text
apps/cli         apps/mcp-server
   |                  |
   v                  v
packages/core -> structured review protocol
   |      \
   |       -> runtime + intelligence contracts
   v
packages/report

packages/fix-engine -> isolated patch experiments
packages/evals      -> corpus, metrics, gates
packages/ui-runner  -> browser/runtime support
```

See [docs/V1_ARCHITECTURE.md](docs/V1_ARCHITECTURE.md).

## MCP / CI

- MCP: [docs/MCP_SERVER.md](docs/MCP_SERVER.md)
- GitHub Actions: [docs/GITHUB_ACTIONS.md](docs/GITHUB_ACTIONS.md)

## Known Limitations

- Technical release gates pass, but V1 quality metrics lack representative samples.
- Multi-model provider adapters are not certified with live credentials.
- Browser/runtime review is not certified end-to-end by eval.
- Patch success/regression rates are not yet meaningful over a representative corpus.
- Go/Rust/Java/C# are not V1-supported languages.
- Some docs outside the V1 canonical set are historical phase reports.

## Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm -r run lint
corepack pnpm eval -- --hard-fail
```

## Canonical Documentation

- [docs/V1_ARCHITECTURE.md](docs/V1_ARCHITECTURE.md)
- [docs/V1_AGENT_PROTOCOL.md](docs/V1_AGENT_PROTOCOL.md)
- [docs/V1_SECURITY_MODEL.md](docs/V1_SECURITY_MODEL.md)
- [docs/V1_EVAL_STANDARD.md](docs/V1_EVAL_STANDARD.md)
- [docs/V1_PROVIDER_MODEL.md](docs/V1_PROVIDER_MODEL.md)
- [docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md](docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md)

## License

MIT. See [LICENSE](LICENSE).
