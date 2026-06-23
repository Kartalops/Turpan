# Turpan MCP Server — Integration Guide

Turpan exposes its review, test, and fix capabilities via the **Model Context Protocol (MCP)**,
enabling AI coding agents (Claude Code, OpenCode, Cursor, etc.) to call Turpan as a backend
service while they work in a project.

## Quick Start

### 1. Build the MCP Server

```bash
cd Turpan-Review-Agent
pnpm install
pnpm -r build
```

### 2. Add to Claude Code MCP Settings

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "turpan": {
      "command": "node",
      "args": ["/absolute/path/to/Turpan-Review-Agent/apps/mcp-server/dist/index.js", "mcp", "serve"],
      "env": {}
    }
  }
}
```

Or use the example config:

```bash
# Print the config to stdout
node apps/mcp-server/dist/index.js mcp config
```

### 3. Restart Claude Code

After saving settings, reload Claude Code's MCP servers. Turpan will appear in the list of
available tools.

---

## MCP Commands

```bash
# Start the MCP server (stdio transport)
turpan mcp serve

# Scope to a specific workspace (recommended for single-project agents)
turpan mcp serve --workspace ./my-project

# Show configuration for AI agent clients
turpan mcp config

# Check MCP status and available tools
turpan mcp status
```

---

## Available Tools

### `turpan.review_project`

Run a full code review on a project.

```json
{
  "projectPath": "./my-project",
  "mode": "quick",          // "quick" | "deep"
  "includeUi": false,
  "includeRuntime": false,
  "includeSecurity": true,
  "includeAgentAudit": false,
  "taskFile": ".turpan/task.md",
  "fixMode": "patch-only"   // "patch-only" | "apply"
}
```

**Output:**
```json
{
  "runId": "2026-06-20T10-00-00-000Z",
  "verdict": "CONDITIONAL_GO",
  "score": 74,
  "findingsSummary": "12 findings (1 critical, 3 high, 5 medium, 3 low)",
  "reportPath": ".turpan/runs/2026-06-20T10-00-00-000Z/TURPAN_ANALYSIS.md"
}
```

### `turpan.review_diff`

Review the diff between two git refs.

```json
{
  "projectPath": "./my-project",
  "baseRef": "main",
  "targetRef": "feature-branch",
  "includeUi": false
}
```

### `turpan.live_ui_test`

Run Playwright-based live UI tests.

```json
{
  "projectPath": "./my-project",
  "url": "http://localhost:3000",  // optional — skips server start
  "headed": false,
  "mobile": false,
  "trace": false
}
```

### `turpan.agent_output_audit`

Compare agent implementation against the original task specification.

```json
{
  "projectPath": "./my-project",
  "taskFile": ".turpan/task.md",
  "agentName": "claude-code"
}
```

### `turpan.fix_findings`

Generate or apply fixes for findings.

```json
{
  "projectPath": "./my-project",
  "runId": "2026-06-20T10-00-00-000Z",  // optional — defaults to latest
  "findingIds": ["finding-1", "finding-2"],  // optional — defaults to all
  "fixMode": "patch-only"   // "patch-only" | "apply"
}
```

**Security:** `fixMode` defaults to `patch-only`. Applying patches (`fixMode: "apply"`) requires
explicit user confirmation in the calling agent.

### `turpan.get_report`

Retrieve the analysis report.

```json
{
  "projectPath": "./my-project",
  "runId": "2026-06-20T10-00-00-000Z",
  "format": "markdown"   // "markdown" | "html" | "json"
}
```

### `turpan.get_findings`

Retrieve findings, optionally filtered.

```json
{
  "projectPath": "./my-project",
  "runId": "2026-06-20T10-00-00-000Z",
  "severity": "high",    // optional
  "category": "security" // optional
}
```

---

## MCP Resources

Turpan exposes run artifacts as MCP resources with the `turpan://` URI scheme:

| URI | Description |
|-----|-------------|
| `turpan://runs/latest/TURPAN_ANALYSIS.md` | Human-readable analysis report |
| `turpan://runs/latest/TURPAN_FINDINGS.json` | Structured findings |
| `turpan://runs/latest/TURPAN_SCORECARD.json` | Quality scorecard |
| `turpan://runs/latest/TURPAN_PATCH.diff` | Unified patch for auto-safe fixes |
| `turpan://runs/latest/screenshots/` | UI test screenshots (JSON index) |
| `turpan://runs/latest/logs/` | Run logs directory |
| `turpan://runs/<runId>/...` | Specific run artifacts |

Example (Claude Code):
```
Read turpan://runs/latest/TURPAN_FINDINGS.json
```

---

## Example Agent Workflow

A typical integration where an AI agent uses Turpan to validate its work:

```
1. Agent finishes implementing a feature.

2. Agent calls turpan.review_project:
   → { projectPath: ".", mode: "deep", includeSecurity: true }

3. Agent reads the findings:
   GET turpan://runs/latest/TURPAN_FINDINGS.json

4. Agent reviews the analysis:
   GET turpan://runs/latest/TURPAN_ANALYSIS.md

5. Agent decides to fix critical findings:
   → turpan.fix_findings { projectPath: ".", fixMode: "patch-only" }

6. Agent applies the patch:
   (Agent reads .turpan/runs/<runId>/TURPAN_PATCH.diff and applies manually,
    or calls turpan.fix_findings with fixMode: "apply" for automatic application)

7. Agent re-runs review to verify:
   → turpan.review_project { projectPath: ".", mode: "quick" }

8. Agent presents the final Turpan Analysis to the user.
```

---

## Security Model

| Concern | Protection |
|---------|------------|
| Read-only by default | All tools are read-only unless `fixMode: apply` is passed |
| Patch-only default | `fixMode` defaults to `patch-only` — no automatic file modification |
| Apply requires explicit | `fixMode: "apply"` must be in the tool call arguments |
| Path traversal | Blocked — `..` sequences rejected, paths normalized |
| Workspace allowlist | Optional — scope MCP access to specific directories |
| Secret redaction | API keys, tokens, passwords redacted from all responses |
| No arbitrary shell | Only Turpan review/fix/test workflows run — no custom commands |
| Error sanitization | Error messages never expose file paths, env values, or internals |

---

## Workspace Scoping

For multi-project AI agents, restrict MCP access to a specific project:

```bash
# Scoped to a single project — cannot access other directories
turpan mcp serve --workspace ./my-project
```

In settings.json:

```json
{
  "mcpServers": {
    "turpan": {
      "command": "node",
      "args": ["/path/to/turpan-mcp", "mcp", "serve", "--workspace", "/home/user/my-project"],
      "env": {}
    }
  }
}
```

---

## Troubleshooting

**Tools not appearing in Claude Code:**
- Ensure the server builds successfully: `cd apps/mcp-server && pnpm build`
- Check the path to `dist/index.js` is absolute
- Restart Claude Code after updating settings

**"Workspace violation" errors:**
- The project path is outside the configured workspace allowlist
- Run with `--workspace <path>` to allow access to that directory

**Secrets appearing in responses:**
- This is a bug — please report it
- Known secret patterns (AWS keys, GitHub tokens, env vars) are automatically redacted