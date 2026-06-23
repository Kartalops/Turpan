# MCP Server

The Turpan MCP server exposes Turpan's review, test, and fix capabilities to
AI agents via the [Model Context Protocol](https://modelcontextprotocol.io/).

## What is the MCP server?

It's a small Node.js process that speaks MCP over stdio. AI agents (Claude
Code, Cursor, custom agents, etc.) connect to it as a "tool provider" and can
then call Turpan's review/fix capabilities from inside their workflow.

```text
┌──────────────┐    stdio (JSON-RPC)   ┌────────────────┐
│  AI agent    │ ───────────────────▶ │ turpan mcp     │
│  (Claude…)   │ ◀─────────────────── │ serve          │
└──────────────┘                       └────────────────┘
                                                  │
                                                  ▼
                                          ┌────────────────┐
                                          │  target repo   │
                                          └────────────────┘
```

The agent doesn't shell out to `pnpm exec turpan review .` — it calls
`turpan.review_project` and gets back a structured response.

## Quick start

### 1. Start the server

```bash
turpan mcp serve                       # unrestricted
turpan mcp serve --workspace ./my-app # scoped to one project
turpan mcp serve --workspace ./my-app \
  --max-calls-per-minute 60 \
  --max-review-calls-per-minute 20 \
  --max-ui-test-calls-per-minute 10
```

The server runs in the foreground, communicating over stdio. In a normal
Claude Code session you don't run this manually — the agent host starts it.

### 2. Configure your MCP host

For Claude Code, add to `~/.claude/settings.json` (or the per-project
`.mcp.json`):

```json
{
  "mcpServers": {
    "turpan": {
      "command": "node",
      "args": [
        "/path/to/turpan/apps/cli/dist/index.js",
        "mcp", "serve"
      ]
    }
  }
}
```

Or use the helper:

```bash
turpan mcp config        # prints a ready-to-paste snippet
```

For a workspace-scoped setup:

```bash
turpan mcp serve --workspace ~/code/my-saas
```

…with the args extended to `--workspace ~/code/my-saas`.

## Tools exposed

The server exposes seven tools, all read-only by default:

| Tool                          | Purpose                                                 |
|-------------------------------|---------------------------------------------------------|
| `turpan.review_project`       | Run a code review (quick/deep, optional UI/runtime)      |
| `turpan.review_diff`          | Review only the files changed between two git refs       |
| `turpan.live_ui_test`         | Live Playwright UI testing                               |
| `turpan.agent_output_audit`   | Compare AI agent's output against the original task      |
| `turpan.fix_findings`         | Generate patches (and optionally apply with explicit consent) |
| `turpan.get_report`           | Retrieve the Markdown/HTML/JSON report for a run         |
| `turpan.get_findings`         | Retrieve the structured findings list                    |

All tool inputs are validated with Zod schemas. All tool outputs are
**redacted** to remove any secrets that might appear in evidence.

## Resources exposed

Beyond tools, the server exposes **MCP resources** — readable blobs
identified by a URI:

```
turpan://runs/latest/TURPAN_ANALYSIS.md
turpan://runs/latest/TURPAN_FINDINGS.json
turpan://runs/latest/TURPAN_SCORECARD.json
turpan://runs/latest/TURPAN_PATCH.diff
turpan://runs/latest/screenshots/
turpan://runs/latest/logs/
turpan://runs/<runId>/...
```

Agents can `read` these resources directly — no need to call a tool first.

## Operational controls (public beta)

### Rate limiting

Every MCP client is subject to per-process rate limits:

| Limit | Default | Configurable |
|-------|---------|--------------|
| Global calls/minute | 60 | `--max-calls-per-minute` |
| `review_project` calls/min | 20 | `--max-review-calls-per-minute` |
| `live_ui_test` calls/min | 10 | `--max-ui-test-calls-per-minute` |
| Other tools calls/min | 20 | `--max-tool-calls-per-minute` |

When a limit is exceeded, the tool returns a structured JSON error:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Global rate limit exceeded: 60 calls per minute",
    "retryAfterMs": 45000,
    "limit": 60
  }
}
```

### Timeouts

Each tool has a maximum execution time:

| Tool | Default | Description |
|------|---------|-------------|
| `review_project`, `review_diff`, `live_ui_test`, `agent_output_audit`, `fix_findings` | 5 min | Long-running analysis |
| `get_report`, `get_findings` | 2 min | Short reads |

Timeout returns:

```json
{
  "error": {
    "code": "TOOL_TIMEOUT",
    "message": "Tool 'turpan.review_project' timed out after 300000ms",
    "toolName": "turpan.review_project",
    "maxMs": 300000
  }
}
```

### Concurrency guard

Only one review-writing tool (`review_project`, `review_diff`, `live_ui_test`, `agent_output_audit`) can run per workspace at a time. A second concurrent call returns:

```json
{
  "error": {
    "code": "WORKSPACE_BUSY",
    "message": "Workspace is busy with an active review run (run_..._abc12345)",
    "activeRunId": "run_..._abc12345",
    "activeSince": "2026-06-20T10:00:00.000Z",
    "activeTool": "turpan.review_project",
    "retryAfterMs": 30000
  }
}
```

### Audit log

Every tool call is written to `.turpan/mcp-audit.log` with:

- `timestamp` (ISO 8601)
- `toolName`, `projectPath`, `workspace`
- `sessionId` / `callerId` / `runId`
- `inputSummary` (all secrets redacted via `redactObject`)
- `outputSummary` (truncated to 500 chars)
- `status`: `success | failure | rejected | timeout`
- `durationMs`

A workspace-scoped log is also written to `.turpan/runs/<runId>/mcp-audit.jsonl`.

## Security model

The MCP server is **read-only by default**. Every destructive operation
requires explicit opt-in:

| Operation                 | Default | Requires                               |
|---------------------------|---------|-----------------------------------------|
| Run a review              | ✅      | nothing                                |
| Get report / findings     | ✅      | nothing                                |
| Generate patch            | ✅      | nothing (writes TURPAN_PATCH.diff)      |
| **Apply patch**           | ❌      | `fixMode: 'apply'` (explicit)            |
| **Delete files**          | ❌      | not supported via MCP                    |
| **Modify dependencies**   | ❌      | not supported via MCP                    |

The `turpan.fix_findings` tool's `fixMode` parameter is one of:
`patch-only` (default), `report-only`, or `apply`. The modes `auto-safe` and
`interactive` are intentionally NOT exposed via MCP — those require a
human-in-the-loop.

### Workspace allowlist

When started with `--workspace <path>`, all tool calls are scoped to that
path. Path traversal (`..`) and absolute paths outside the workspace are
**rejected** at the schema level.

### Path traversal blocking

The server rejects any path containing `..` segments in tool inputs. This
includes:

- `projectPath` in `review_project`
- `taskFile` in `agent_output_audit`
- `findingsFile` in `fix_findings`
- All `runId` values must match a strict regex

### Secret redaction

Every tool output passes through a redaction filter before being returned.
The filter strips:

- AWS access keys (`AKIA...`)
- GitHub PATs (`ghp_...`)
- Stripe keys (`sk_live_...`, `sk_test_...`)
- OpenAI keys (`sk-...`)
- Slack tokens (`xox[baprs]-...`)
- Long alphanumeric strings assigned to `TOKEN`/`KEY`/`SECRET` variables
- Database URLs with embedded passwords
- Authorization headers with bearer tokens

The redaction is non-destructive — the originals remain in
`.turpan/runs/<runId>/logs/` for your own use.

## Example agent workflow

A typical AI agent loop using Turpan:

```
1. Agent finishes implementing a feature.
2. Agent → turpan.review_project { projectPath: ".", mode: "deep" }
3. Agent reads turpan://runs/latest/TURPAN_FINDINGS.json
4. Agent reviews findings.
5. Agent → turpan.fix_findings { projectPath: ".", fixMode: "patch-only" }
6. Agent reads .turpan/runs/latest/TURPAN_PATCH.diff
7. Agent → turpan.review_project (re-run to verify)
8. Agent presents Turpan Analysis to user.
```

If the user wants the patches applied, they run `turpan fix --apply` outside
the agent — keeping the agent strictly read-only.

## Troubleshooting

### "command not found: turpan"

The MCP server is started by the host (Claude Code), not by you. The `command`
in the MCP config must point at a working `node` invocation:

```json
"command": "node",
"args": ["/abs/path/to/apps/cli/dist/index.js", "mcp", "serve"]
```

Don't use `"command": "turpan"` unless `turpan` is on the agent host's PATH.

### "Tool not found: turpan.review_project"

The server didn't start cleanly. Check stderr — usually a `pnpm install` or
`pnpm build` was missed.

### Path validation failures

If you see `Invalid path: contains '..'`, the agent is trying to escape the
workspace. This is intentional — relax the workspace scope to fix it.

## See also

- **[Security Model](./SECURITY_MODEL.md)** — full security properties.
- **[CLI Usage](./CLI_USAGE.md#turpan-mcp)** — local CLI commands.
- **[examples/mcp/turpan-mcp.json](../examples/mcp/turpan-mcp.json)** — sample config.
