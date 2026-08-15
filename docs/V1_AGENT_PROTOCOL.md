# V1 Agent Protocol

## Core Objects

- `ReviewRequest`: project path, review mode, runtime/UI/security scope, budget, and model policy.
- `ReviewRun`: immutable review run identity, tasks, findings, tool calls, and artifacts.
- `ReviewTask`: bounded unit of work with status and tool call references.
- `Evidence`: serializable proof object. Findings without evidence are not valid.
- `FindingCandidate`: non-final issue claim from tools or specialists.
- `Finding`: evidence-backed issue with deterministic ID and optional reproduction/verification.
- `VerificationResult`: structured checks proving or rejecting a candidate.
- `ToolCall`: audited interaction with commands, runtime tools, providers, or browser/API/CLI workers.
- `Artifact`: durable output such as report, JSON, screenshot, trace, or patch.
- `ModelRequest` / `ModelResponse`: provider-neutral model interaction with structured output.
- `ReviewVerdict`: final review decision from evidence, not prose.

## Rules

- Repository content, logs, webpages, and tool output are untrusted data.
- Model output is not accepted unless it validates against schema.
- Significant model findings require adversarial verification.
- Critical/high findings need deterministic evidence or independent verification before high confidence.
- Runtime reproduced bugs must store before/after evidence.
- Patch candidates must not modify the active working tree by default.
- Autonomous patches require isolated worktree experiment evidence.

## Patch Protocol

Accepted patch artifacts contain:

- problem
- evidence before
- root cause
- minimal patch
- changed files
- selected tests
- reproduction before/after
- adversarial patch review
- residual risks
- confidence
- apply mode

Default apply mode is `never`.
