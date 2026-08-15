# Final Code Purification Report

## Result

No broad deletion was performed because the required V1 benchmark did not pass and no component had enough successful/failed ablation evidence to justify deletion safely.

One concrete dependency-boundary cleanup was completed:

- Removed the CLI application dependency on `@turpan/mcp-server`.
- Kept CLI and MCP as sibling adapters.
- CLI now delegates `turpan mcp ...` to the `turpan-mcp` binary instead of importing MCP server application code.
- Removed the `@turpan/core` devDependency on `@turpan/ui-runner`, eliminating the pnpm workspace cycle.

## Measurements

Current measured source state:

- Production TypeScript source files: 312
- Production TypeScript LOC: 51,958
- Workspace packages/apps: 12
- CLI workspace dependencies after cleanup: 8
- MCP workspace dependencies: 5

## Before / After

| Metric | Before | After |
| --- | ---: | ---: |
| Production LOC | ~51,958 | ~51,958 |
| Production source files | 312 | 312 |
| Workspace packages/apps | 12 | 12 |
| CLI app dependency on MCP app | yes | no |
| Core/ui-runner workspace cycle | yes | no |
| Full build gate | failing | passing |
| Full lint gate | failing | failing |
| Full test gate | failing | failing |
| Agent eval gate | failing | failing |

## Duplicate / Obsolete Items Still Present

These remain blockers for future normal product iterations:

- `packages/core/src/reports/*` still exists alongside canonical `packages/report/*`.
- `packages/shared/src/types/*` still duplicates important domain shapes that also exist in `packages/core`.
- Multiple execution paths remain outside a single canonical execution primitive.
- Generated `dist_test` and tracked build artifacts contain stale historical code.
- CLI lint surfaces many type errors hidden by tsup build.
- Diff analyzer lint has implicit-any and package declaration issues.

## Deleted / Removed

- Removed `@turpan/mcp-server` from `apps/cli` dependencies.
- Removed `@turpan/ui-runner` from `packages/core` devDependencies.

No analyzers, specialists, provider abstractions, or prompts were deleted because benchmark results did not isolate a losing component. Deleting detection code while eval recall is already failing would worsen quality.

## Decision

Conceptual reduction occurred at adapter/dependency boundaries, not broad LOC reduction.

Further deletion must be driven by passing/failing ablation data, not architecture preference.
