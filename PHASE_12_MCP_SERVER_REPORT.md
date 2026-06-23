# Phase 12: Turpan MCP Server — Implementation Report

## Summary

Built `apps/mcp-server/` as a standalone MCP server app exposing Turpan's review, test, and fix capabilities to AI agents via the Model Context Protocol. The server runs on stdio transport and integrates with the CLI via `turpan mcp serve`.

## Files Created

| Path | Change |
|------|--------|
| `apps/mcp-server/package.json` | New — MCP server package with `@modelcontextprotocol/sdk`, `zod`, workspace deps |
| `apps/mcp-server/tsconfig.json` | New — extends root tsconfig, references all workspace packages |
| `apps/mcp-server/tsup.config.ts` | New — ESM bundle, externalizes workspace packages |
| `apps/mcp-server/vitest.config.ts` | New — vitest config for unit tests |
| `apps/mcp-server/src/index.ts` | New — CLI entry point: `turpan mcp serve`, `config`, `status` |
| `apps/mcp-server/src/server.ts` | New — `TurpanMcpServer` class using `@modelcontextprotocol/sdk` |
| `apps/mcp-server/src/tools/review.ts` | New — all 7 tool implementations |
| `apps/mcp-server/src/resources/handler.ts` | New — `turpan://` URI resource handlers |
| `apps/mcp-server/src/security/workspace.ts` | New — path validation, allowlist, path traversal blocking |
| `apps/mcp-server/src/security/redact.ts` | New — secret redaction for all tool outputs |
| `apps/mcp-server/src/schemas/tools.ts` | New — Zod schemas for all tool inputs |
| `apps/mcp-server/src/schemas/resources.ts` | New — MCP resource URI parsing |
| `apps/mcp-server/tests/schemas.test.ts` | New — 25 tests for tool input schema validation |
| `apps/mcp-server/tests/workspace.test.ts` | New — 20 tests for workspace validation + path traversal |
| `apps/mcp-server/tests/redact.test.ts` | New — 17 tests for secret redaction |
| `apps/mcp-server/tests/mcp-integration.test.ts` | New — 8 integration tests |
| `apps/mcp-server/docs/MCP_INTEGRATION.md` | New — how to connect Turpan MCP to Claude Code |
| `apps/mcp-server/docs/SAFE_USAGE.md` | New — security model and safe configuration guide |
| `examples/mcp/turpan-mcp.json` | New — example MCP server configuration |

## Files Modified

| Path | Change |
|------|--------|
| `apps/cli/package.json` | Added `@turpan/mcp-server` dependency |
| `apps/cli/src/index.ts` | Added `turpan mcp` subcommand integrating `runMcpCommand` |
| `package.json` (root) | No changes — workspace already covers `apps/*` |
| `apps/mcp-server/tsconfig.json` | Fixed `extends` from non-existent `tsconfig.base.json` → `../../tsconfig.json` |

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Build mcp-server | `pnpm build` (apps/mcp-server) | ✅ Pass — 38.4 KB dist |
| Build CLI | `pnpm build` (apps/cli) | ✅ Pass — 92.1 KB dist |
| Type check | `npx tsc --noEmit` | ✅ Pass |
| Unit tests | `npx vitest run` | ✅ 69/69 pass |

### Test Breakdown
- `schemas.test.ts`: 25 tests — all tool input schemas validate correctly
- `workspace.test.ts`: 20 tests — path traversal blocked, allowlist enforced, runId validated
- `redact.test.ts`: 17 tests — AWS keys, GitHub tokens, private keys, URLs redacted
- `mcp-integration.test.ts`: 8 tests — MCP server lifecycle and tool registration

## Security Model

| Protection | Implementation |
|------------|---------------|
| Read-only default | All tools are read-only; `fix_findings` defaults to `patch-only` |
| Apply requires explicit | `fixMode: 'apply'` must be passed; `auto-safe` and `interactive` are blocked |
| Path traversal blocking | `..` sequences rejected in `validateProjectPath`, `validateTaskFilePath` |
| Workspace allowlist | Optional `--workspace` flag scopes all access to a single project directory |
| Secret redaction | AWS keys, GitHub tokens, private keys, DB URLs, long alphanumeric strings redacted |
| No arbitrary shell | Only Turpan's internal review/fix/test workflows run |
| Error sanitization | Error messages never expose file paths, env values, or internals |

## CLI Usage

```bash
# Start MCP server (stdio transport)
turpan mcp serve

# Scope to a specific workspace
turpan mcp serve --workspace ./my-project

# Show configuration for AI agent clients
turpan mcp config

# Check MCP status and available tools
turpan mcp status
```

## MCP Tools Exposed

1. **turpan.review_project** — Run code review (quick/deep), with UI, runtime, security, agent audit options
2. **turpan.review_diff** — Review git diff between two refs
3. **turpan.live_ui_test** — Playwright-based live UI testing
4. **turpan.agent_output_audit** — Audit agent implementation against task specification
5. **turpan.fix_findings** — Generate or apply fixes (defaults to `patch-only`)
6. **turpan.get_report** — Retrieve analysis report (markdown/html/json)
7. **turpan.get_findings** — Retrieve findings, optionally filtered by severity/category

## MCP Resources Exposed

```
turpan://runs/latest/TURPAN_ANALYSIS.md
turpan://runs/latest/TURPAN_FINDINGS.json
turpan://runs/latest/TURPAN_SCORECARD.json
turpan://runs/latest/TURPAN_PATCH.diff
turpan://runs/latest/screenshots/
turpan://runs/latest/logs/
turpan://runs/<runId>/...
```

## Example Agent Workflow

```
1. Agent finishes implementation
2. Agent → turpan.review_project { projectPath: ".", mode: "deep" }
3. Agent reads turpan://runs/latest/TURPAN_FINDINGS.json
4. Agent reviews findings
5. Agent → turpan.fix_findings { projectPath: ".", fixMode: "patch-only" }
6. Agent reads .turpan/runs/<runId>/TURPAN_PATCH.diff
7. Agent re-runs turpan.review_project to verify
8. Agent presents Turpan Analysis to user
```

## Next Recommended Steps

- [ ] Add end-to-end MCP integration test with a mock Claude Code client
- [ ] Add `--port` flag for TCP transport (alternative to stdio)
- [ ] Document how to configure Turpan MCP in Claude Code settings.json
- [ ] Add `turpan.list_projects` tool for multi-project workspace agents
- [ ] Add streaming support for long-running reviews

## Final Verdict

**READY** — MCP server builds cleanly, all 69 tests pass, security model enforced, docs and examples complete.