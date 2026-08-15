# V1 Security Model

## Trust Boundaries

- User instructions are trusted.
- Repository files are untrusted.
- README, comments, test names, logs, webpages, UI text, and tool output are untrusted.
- Model providers are external processors unless configured as local/offline.
- Runtime execution is potentially dangerous and must pass policy.
- Patch experiments run in isolated worktrees by default.

## Prompt Injection Defense

Repository text is wrapped and treated as data. Injection-like content is flagged, including instructions to ignore prior instructions, reveal prompts, or override policy.

Model prompts must not place untrusted repository text in instruction positions.

## Execution Safety

- Boot discovery ranks candidates but does not execute arbitrary commands.
- Commands pass the existing command safety policy.
- Runtime resources are owned by a review run and cleaned by the supervisor.
- UI actions are classified as `SAFE`, `REVIEW_REQUIRED`, or `FORBIDDEN`.
- API execution defaults to safe read/test calls.
- Patch experiments run in temporary git worktrees and cleanup in failure paths.

## Data Handling

- Secrets are redacted before persistence or provider calls.
- Source code may leave the machine only under explicit model policy.
- Offline/local provider mode remains supported by policy.
- Memory must be inspectable, removable, versioned, and subordinate to current evidence.

## Default Stance

Read-only review is the default. Any working-tree modification must be explicit.
