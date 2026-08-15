# Turpan 🐪

Turpan is an evidence-driven software review agent for TypeScript/JavaScript and Python repositories.

> Models reason. Tools prove.

**Status**

`V1 NOT YET CERTIFIED`

Turpan's engineering gates are green. V1 product certification is still blocked by limited benchmark scale, confidence calibration depth, and broader real-world proof.

## Why Turpan

Turpan does not stop at "ask a model to review code".

It combines deterministic analyzers, structured model reasoning, runtime evidence, browser checks, and isolated patch experiments so findings can be tied back to proof instead of prose.

## Review Loop

```text
repository
-> fingerprint
-> analyze
-> reason
-> reproduce
-> verify
-> optionally patch in isolation
-> report
```

## What Is Verified Today

| Area | Current state |
| --- | --- |
| Static review | Project fingerprinting, deterministic analyzers, diff-scoped review |
| Runtime/browser | Verified Playwright-backed local smoke path |
| Intelligence | Provider-neutral model contracts, routing, specialists, verification primitives |
| Fixes | Isolated worktree patch experiments with validated local smoke path |
| Platform | CLI adapter, MCP adapter, dependency/SBOM review, eval package |

## Quick Start

Install with the repository's canonical package manager:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm -r run build
corepack pnpm -r run lint
corepack pnpm -r run test
corepack pnpm eval -- --hard-fail
```

CLI examples:

```bash
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js review . --deep
node apps/cli/dist/index.js review-diff . --base main --target HEAD
node apps/cli/dist/index.js fix .
```

MCP smoke:

```bash
node apps/mcp-server/dist/index.js --help
```

## Verified Local Gates

| Gate | Result |
| --- | --- |
| Install | PASS |
| Build | PASS |
| Lint / typecheck | PASS |
| Tests | PASS |
| Agent eval | PASS |
| CLI smoke | PASS |
| MCP smoke | PASS |

Latest local test/eval snapshot:

- `corepack pnpm -r run test`: `906 passed`, `0 failed`, `1 skipped`
- `corepack pnpm eval -- --quiet --hard-fail`: `22/22 PASS`

See [docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md](docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md).

## Multi-Model and Privacy

Turpan includes provider-neutral model contracts, routing, specialist roles, structured outputs, adversarial verification, and evidence-weighted consensus primitives.

Remote provider use is policy-bound. Local/offline mode and secret redaction are part of the current safety model.

## Runtime, Browser, and Fixes

Turpan already contains:

- boot and runtime supervision primitives
- Playwright-based UI execution
- runtime-to-source correlation
- isolated patch experiments in temporary git worktrees

The active working tree remains read-only by default.

## Supported Languages

Eval-backed today:

- TypeScript / JavaScript
- Python

Capability-described but not V1-certified:

- Go
- Rust
- Java
- C#

## Security

Current safeguards include:

- command safety policy
- workspace-scoped MCP boundaries
- secret redaction
- prompt-injection defense for repository content
- safe UI action policy
- isolated fix validation

See [docs/V1_SECURITY_MODEL.md](docs/V1_SECURITY_MODEL.md).

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
packages/ui-runner  -> runtime and browser support
```

Canonical V1 documents:

- [docs/V1_ARCHITECTURE.md](docs/V1_ARCHITECTURE.md)
- [docs/V1_AGENT_PROTOCOL.md](docs/V1_AGENT_PROTOCOL.md)
- [docs/V1_SECURITY_MODEL.md](docs/V1_SECURITY_MODEL.md)
- [docs/V1_EVAL_STANDARD.md](docs/V1_EVAL_STANDARD.md)
- [docs/V1_PROVIDER_MODEL.md](docs/V1_PROVIDER_MODEL.md)
- [docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md](docs/V1_RELEASE_CANDIDATE_CERTIFICATION.md)

Historical phase and release reports were moved under [docs/archive/README.md](docs/archive/README.md).

## Limitations

- V1 product certification is still `NO_GO`.
- Quality metrics need broader benchmark coverage before release certification.
- Live provider benchmark evidence is still limited.
- Browser/runtime and patch-rate claims are not yet broad enough for final V1 sign-off.

## Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm -r run build
corepack pnpm -r run lint
corepack pnpm -r run test
corepack pnpm eval -- --hard-fail
```

## License

MIT. See [LICENSE](LICENSE).
