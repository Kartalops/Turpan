# Turpan MCP Server — Safety & Operations Guide

This document describes how to use the Turpan MCP server securely in production
environments with AI coding agents, and how to operate it safely for long-running
local agent workflows and CI usage.

## Table of Contents

1. [Threat Model](#threat-model)
2. [Defense Layers](#defense-layers)
3. [Claude Code Local Setup](#claude-code-local-setup)
4. [CI Setup](#ci-setup)
5. [Recommended Flags](#recommended-flags)
6. [What Agents Can and Cannot Do](#what-agents-can-and-cannot-do)
7. [Inspecting Audit Logs](#inspecting-audit-logs)
8. [Recovering from a Stale Lock](#recovering-from-a-stale-lock)
9. [Log Rotation](#log-rotation)
10. [Incident Response](#incident-response)

---

## Threat Model

Turpan MCP is designed for AI agents that need to review, test, and fix code in a
sandboxed environment. The primary threats are:

1. **Unintended file modification** — an agent applying fixes without human oversight
2. **Path traversal** — an agent accessing files outside the intended project
3. **Secret exfiltration** — sensitive values appearing in Turpan output
4. **Arbitrary command execution** — an agent running dangerous shell commands via Turpan
5. **Stale locks** — a crashed process leaves a lock that blocks future reviews
6. **Log accumulation** — unbounded audit logs consuming disk space
7. **Rate limit abuse** — an agent flooding the server with calls
8. **Run index growth** — `.turpan/mcp-runs.jsonl` accumulating forever

## Defense Layers

### Layer 1: Read-Only Default

All Turpan tools are read-only by default. The only tool that modifies files is
`turpan.fix_findings`, and it defaults to `patch-only` mode.

**What this means for agents:**
- `turpan.review_project` — reads code, never modifies
- `turpan.review_diff` — reads git diff, never modifies
- `turpan.live_ui_test` — runs in headless browser, no file writes
- `turpan.agent_output_audit` — reads files, never modifies
- `turpan.fix_findings` — generates a diff file, does not apply it by default
- `turpan.get_report` / `turpan.get_findings` — reads existing reports

### Layer 2: Patch-Only Default for Fixes

When `turpan.fix_findings` is called with `fixMode: "patch-only"` (the default):
- A unified diff file is generated at `.turpan/runs/<runId>/TURPAN_PATCH.diff`
- No files in the project are modified
- The agent must explicitly read and apply the patch itself

When `fixMode: "apply"` is passed:
- The fix engine applies patches to the working tree
- A rollback record is created before any changes
- Validation checks (build, test) run after each fix
- If validation fails, changes are rolled back automatically

### Layer 3: Workspace Allowlist

The `--workspace` flag restricts Turpan to a specific project directory:

```bash
turpan mcp serve --workspace ./my-project
```

With this flag:
- Any `projectPath` outside `./my-project` is rejected
- `taskFile` must be within the project
- Output files are always written to `<project>/.turpan/runs/`
- Path traversal attacks (`../`) are blocked even if a relative path is passed

### Layer 4: Secret Redaction

All Turpan output is passed through a secret redaction filter:

- AWS access keys (`AKIA...`) → `AKIA***[REDACTED]`
- GitHub tokens (`ghp_...`, `gho_...`) → `gh***[REDACTED]`
- Private keys (`-----BEGIN ... PRIVATE KEY-----`) → `[PRIVATE KEY REDACTED]`
- Database URLs with passwords → `[USER]:[REDACTED]@[HOST]`
- Environment variables with sensitive names → `[ENV_SECRET]`
- Generic long strings that match API key patterns → `[SECRET]`

### Layer 5: No Arbitrary Shell Execution

Turpan does not expose a general-purpose shell tool. Agents cannot:
- Run custom commands via Turpan
- Execute arbitrary scripts
- Pipe data between unrelated processes

The only execution paths are:
- Turpan's internal analyzers (static analysis, lint, typecheck)
- Build/test/lint commands discovered from the project's `package.json` / Makefile
- Playwright browser automation (for UI testing only)

### Layer 6: Stale Lock Protection

If a review process crashes, the concurrency guard automatically releases the lock
after a configurable timeout + grace period. This prevents one crashed review from
blocking all future reviews in the same workspace.

Default: lock expires 5 minutes after start, then 30-second grace period before
auto-release.

### Layer 7: Audit Log Rotation

Audit logs are automatically rotated to prevent unbounded disk consumption:
- Configurable max file size (default: 10MB)
- Configurable max rotated files (default: 5)
- Optional daily rotation
- Redaction is preserved in rotated logs (gzip compressed)

---

## Claude Code Local Setup

### Step 1: Install Turpan

```bash
npm install -g @turpan/cli
# or
pnpm add -g @turpan/cli
```

### Step 2: Configure Claude Code MCP

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "turpan": {
      "command": "node",
      "args": ["/path/to/turpan-mcp", "mcp", "serve", "--workspace", "/home/user/projects/my-app"],
      "env": {}
    }
  }
}
```

### Step 3: Restart Claude Code

```bash
# Reload Claude Code MCP servers
# In Claude Code: /reload
```

### Step 4: Verify Connection

```bash
turpan mcp status --project /home/user/projects/my-app
```

You should see:
- Workspace allowlist with your project path
- No active review locks
- Rate limit configuration

### Recommended Local Configuration

```bash
turpan mcp serve \
  --workspace /home/user/projects/my-app \
  --audit-max-size-mb 10 \
  --audit-max-files 5 \
  --stale-lock-timeout-ms 300000 \
  --stale-lock-grace-ms 30000 \
  --log-level info
```

---

## CI Setup

### GitHub Actions Example

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Turpan
        run: npm install -g @turpan/cli

      - name: Run Turpan Review
        run: |
          turpan review project \
            --project-path . \
            --mode deep \
            --include-security \
            --fix-mode patch-only
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Review Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: turpan-report
          path: .turpan/runs/latest/
```

### CI-Specific Recommendations

1. **Always use `--fix-mode patch-only`** — CI environments should never auto-apply fixes
2. **Use `--workspace`** to scope access to the repository being reviewed
3. **Set shorter timeouts** for CI (e.g., `--stale-lock-timeout-ms 180000`)
4. **Upload `.turpan/runs/` as artifacts** for later inspection
5. **Do NOT set `GITHUB_TOKEN`** as an environment variable visible to Turpan — it will be redacted but CI tokens should remain in CI secret storage

### GitLab CI Example

```yaml
review:
  stage: test
  script:
    - npm install -g @turpan/cli
    - turpan review project --project-path . --mode quick --fix-mode patch-only
  artifacts:
    paths:
      - .turpan/runs/
    when: always()
```

---

## Recommended Flags

### For Local Development

```bash
turpan mcp serve \
  --workspace /path/to/project \
  --audit-max-size-mb 10 \
  --audit-max-files 5 \
  --audit-daily-rotation \
  --stale-lock-timeout-ms 300000 \
  --stale-lock-grace-ms 30000 \
  --log-level info
```

### For CI/CD

```bash
turpan mcp serve \
  --workspace /ci/project \
  --audit-max-size-mb 5 \
  --audit-max-files 3 \
  --stale-lock-timeout-ms 180000 \
  --stale-lock-grace-ms 15000 \
  --log-level warn
```

### For High-Frequency Automation

```bash
turpan mcp serve \
  --workspace /path/to/project \
  --max-calls-per-minute 120 \
  --max-review-calls-per-minute 40 \
  --audit-max-size-mb 20 \
  --audit-max-files 10 \
  --stale-lock-timeout-ms 600000 \
  --stale-lock-grace-ms 60000
```

### Flag Reference

| Flag | Description | Default |
|------|-------------|---------|
| `--workspace` | Restrict access to project path | (none — all paths allowed) |
| `--audit-max-size-mb` | Max audit log size before rotation (0=disabled) | 10 |
| `--audit-max-files` | Max rotated audit files to keep | 5 |
| `--audit-daily-rotation` | Enable daily rotation | disabled |
| `--stale-lock-timeout-ms` | Lock expiry time (ms) | 300000 (5 min) |
| `--stale-lock-grace-ms` | Grace period after expiry (ms) | 30000 (30 sec) |
| `--max-calls-per-minute` | Global rate limit | 60 |
| `--max-review-calls-per-minute` | `review_project` rate limit | 20 |
| `--max-ui-test-calls-per-minute` | `live_ui_test` rate limit | 10 |
| `--log-level` | Log verbosity | info |

---

## What Agents Can and Cannot Do

### ✅ Agents CAN:

1. **Review code** — Run `turpan.review_project` or `turpan.review_diff` to analyze code quality
2. **Read reports** — Use `turpan.get_report` and `turpan.get_findings` to retrieve findings
3. **Generate patches** — Use `turpan.fix_findings` with `fixMode: "patch-only"` to create diff files
4. **Audit agent output** — Use `turpan.agent_output_audit` to verify task completion
5. **Test UIs** — Use `turpan.live_ui_test` for Playwright-based UI testing

### ❌ Agents CANNOT:

1. **Apply fixes automatically** — Must use explicit `fixMode: "apply"` with human review
2. **Access files outside workspace** — Path traversal blocked, workspace allowlist enforced
3. **Run arbitrary shell commands** — Only Turpan workflows are exposed
4. **Exfiltrate secrets** — All secrets are redacted from output
5. **Bypass rate limits** — Per-tool and global limits enforced
6. **Ignore concurrency locks** — One review at a time per workspace

### Agent Permissions Matrix

| Tool | Read | Write Files | Network | Rate Limited | Concurrent |
|------|------|-------------|---------|--------------|------------|
| `review_project` | ✅ | ❌ | Limited | ✅ (20/min) | ❌ |
| `review_diff` | ✅ | ❌ | Limited | ✅ (20/min) | ❌ |
| `live_ui_test` | ✅ | ❌ | Full browser | ✅ (10/min) | ❌ |
| `agent_output_audit` | ✅ | ❌ | ❌ | ✅ (10/min) | ❌ |
| `fix_findings` (patch-only) | ✅ | ✅ (diff file only) | ❌ | ✅ (20/min) | ✅ |
| `fix_findings` (apply) | ✅ | ✅ (with rollback) | ❌ | ✅ (20/min) | ✅ |
| `get_report` | ✅ | ❌ | ❌ | ✅ (60/min) | ✅ |
| `get_findings` | ✅ | ❌ | ❌ | ✅ (60/min) | ✅ |

---

## Inspecting Audit Logs

### Finding the Audit Log

The audit log is stored at:
- Global: `<workspace>/.turpan/mcp-audit.log`
- Per-run: `<workspace>/.turpan/runs/<runId>/mcp-audit.jsonl`

### Log Entry Format

Each entry is a JSON object per line:

```json
{
  "timestamp": "2026-06-21T12:00:00.000Z",
  "toolName": "turpan.review_project",
  "projectPath": "/home/user/projects/my-app",
  "workspace": "/home/user/projects/my-app",
  "sessionId": "abc-123",
  "runId": "run_1750512000000_abc12345",
  "inputSummary": {
    "projectPath": "/home/user/projects/my-app",
    "mode": "deep"
  },
  "outputSummary": "review complete, score: 85",
  "status": "success",
  "durationMs": 45230,
  "errorCode": null
}
```

### Reading Rotated Logs

Rotated logs are gzip-compressed with `.gz` extension:

```bash
# List rotated files
ls -la /home/user/projects/my-app/.turpan/mcp-audit.log.*

# View a rotated log
zcat /home/user/projects/my-app/.turpan/mcp-audit.log.2026-06-21T00-00-00.000Z.gz | head -100

# Search for errors
zcat /home/user/projects/my-app/.turpan/mcp-audit.log.*.gz | grep '"status":"failure"'
```

### Rate Limit Events

Rate limit events are also written to the audit log:

```json
{
  "timestamp": "2026-06-21T12:05:00.000Z",
  "toolName": "turpan.review_project",
  "event": "rate_limit_exceeded",
  "status": "rejected",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "errorMessage": "Rate limit exceeded for tool 'turpan.review_project': 20 calls per minute",
  "limit": 20,
  "windowMs": 60000,
  "retryAfterMs": 45000,
  "currentUsed": 20
}
```

### Query Examples

```bash
# Count all tool calls in the last hour
grep "2026-06-21T11:" .turpan/mcp-audit.log | wc -l

# Find all failures
grep '"status":"failure"' .turpan/mcp-audit.log

# Find all rate limit rejections
grep '"event":"rate_limit_exceeded"' .turpan/mcp-audit.log

# Get the most recent 10 runs
tail -10 .turpan/mcp-audit.log | jq -s 'sort_by(.timestamp) | .[-10:]'

# Find runs by tool
grep '"toolName":"turpan.review_project"' .turpan/mcp-audit.log | tail -5
```

---

## Recovering from a Stale Lock

A stale lock occurs when a review process crashes or times out without releasing
the concurrency slot. This blocks subsequent reviews in the same workspace.

### Symptoms

```
[WARN] Workspace busy with active review run: run_xxx
```

The response includes `retryAfterMs: 30000` — the client should retry after 30 seconds.

### Automatic Recovery

By default, the lock is auto-released after:
1. **Stale timeout**: 5 minutes after the lock was acquired
2. **Grace period**: 30 seconds after the timeout

Total worst case: **5 minutes 30 seconds** before automatic recovery.

### Manual Recovery

If you need to recover immediately:

```bash
# Check the status
turpan mcp status --project /path/to/project

# Kill any stalled turpan processes
pkill -f "turpan review"
pkill -f "turpan mcp serve"

# Restart the server
turpan mcp serve --workspace /path/to/project
```

### Reducing Lock Timeout for Faster Recovery

For CI or high-velocity workflows:

```bash
turpan mcp serve \
  --workspace /path/to/project \
  --stale-lock-timeout-ms 60000 \
  --stale-lock-grace-ms 10000
```

This gives:
- Lock expires 1 minute after acquisition
- Auto-release 10 seconds after expiry
- Worst case recovery: **70 seconds**

### Inspecting Active Locks

```bash
turpan mcp status --project /path/to/project
```

Output shows:
```
Concurrency Guard:
  Active run:      run_xxx
    Tool:          turpan.review_project
    Started:       2026-06-21T12:00:00.000Z
    Expires in:    245s
    Workspace:     /path/to/project
  Stale timeout:   300s
  Grace period:    30s
```

---

## Log Rotation

### MCP Run Index (Phase 28)

Each MCP tool call appends a record to `.turpan/mcp-runs.jsonl`:

```jsonl
{"runId":"run_1750512000000_abc12345","tool":"turpan.review_project","projectPath":"/home/user/proj","status":"success","startedAt":"2026-06-22T...","finishedAt":"2026-06-22T...","durationMs":45230,"verdict":"GO","summaryPath":".turpan/runs/run_1750512000000_abc12345/TURPAN_ANALYSIS.md"}
```

This file is append-only — perfect for monitoring CI usage and building dashboards.

### `turpan mcp status` (Phase 28)

The status command shows real-time operational state:

```bash
$ turpan mcp status

🔍 Turpan MCP Status

Workspace:
  Allowlist roots: /home/user/my-saas-app
  Project path:    /home/user/my-saas-app

Concurrency Guard:
  Active run:      run_1750512000000_abc12345
    Tool:          turpan.review_project
    Started:       2026-06-22T12:00:00.000Z
    Expires in:    245s
    Workspace:     /home/user/my-saas-app
  Stale timeout:  300s
  Grace period:   30s

Rate Limits:
  Global:        12/60 calls/min
  turpan.review_project: 3/20 calls/min
  ...

Audit Log:
  Path:          /home/user/my-saas-app/.turpan/mcp-audit.log
  Max size:      10MB
  Max files:     5
  Daily rotate:  enabled

Recent Runs:
  Total recorded runs: 47 (showing last 5)
  success  run_xxx       turpan.review_project  12s · 2026-06-22T12:00:00.000Z
  ...

Last Error:
  RATE_LIMIT_EXCEEDED: Rate limit exceeded for tool 'turpan.review_project': 20 calls per minute
```

### Stale Lock Audit Events (Phase 28)

When a stale lock is auto-released, an audit event is written:

```json
{
  "timestamp": "2026-06-22T12:30:00.000Z",
  "toolName": "turpan.review_project",
  "event": "concurrency_lock_released",
  "reason": "grace_expired",
  "runId": "run_xxx",
  "startedAt": "...",
  "expiresAt": "...",
  "releasedAt": "...",
  "heldMs": 330000
}
```

### Rate Limit Error Structure (Phase 28)

When rate-limited, the error response is structured:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for tool 'turpan.review_project': 20 calls per minute",
    "retryAfterMs": 45000,
    "limit": 20,
    "windowMs": 60000,
    "toolName": "turpan.review_project",
    "currentUsed": 20
  }
}
```

Clients should respect `retryAfterMs` and retry after that delay.

### How It Works (Phase 28)

1. When the audit log exceeds `--audit-max-size-mb`, it is:
   - Gzip-compressed
   - Renamed to `<log>.gz` with a timestamp
   - Truncated to empty

2. When daily rotation is enabled (`--audit-daily-rotation`):
   - At midnight (local time), the log is rotated
   - Named `<log>.daily-<date>.gz`

3. Old rotated files beyond `--audit-max-files` are automatically deleted.

### Configuration Examples

```bash
# Default: 10MB max, 5 rotated files
turpan mcp serve --workspace /path/to/project

# High-volume: 50MB max, 20 rotated files
turpan mcp serve --workspace /path/to/project --audit-max-size-mb 50 --audit-max-files 20

# Daily rotation only (no size-based rotation)
turpan mcp serve --workspace /path/to/project --audit-daily-rotation --audit-max-size-mb 0

# Minimal (CI): 5MB max, 3 rotated files
turpan mcp serve --workspace /path/to/project --audit-max-size-mb 5 --audit-max-files 3
```

### Preserving Redaction in Rotated Logs

Rotated logs are gzip-compressed to:
1. Save disk space
2. Preserve redaction (content is not re-processed)

You can verify redaction in rotated logs:

```bash
zcat .turpan/mcp-audit.log.*.gz | grep -i "AKIA"       # Should show no real keys
zcat .turpan/mcp-audit.log.*.gz | grep "sk-live"        # Should show no real tokens
```

---

## Incident Response

If you suspect unauthorized access via Turpan MCP:

1. **Revoke the MCP connection** — Remove the `turpan` entry from your Claude Code settings
2. **Check run artifacts** — Inspect `.turpan/runs/` for unexpected runs or unusual project paths
3. **Audit the audit log** — Search for unauthorized tool calls or rejected access attempts:
   ```bash
   grep '"status":"rejected"' .turpan/mcp-audit.log
   grep '"errorCode":"WORKSPACE_VIOLATION"' .turpan/mcp-audit.log
   grep '"errorCode":"PATH_TRAVERSAL"' .turpan/mcp-audit.log
   ```
4. **Review rate limit events** — Unusual spike in `rate_limit_exceeded` may indicate abuse
5. **Audit rollback records** — Check `.turpan/backups/` for applied patches
6. **Review git history** — If `apply` mode was used, check `git log` for unexpected commits
7. **Reset if needed** — Use `git checkout -- .` to discard uncommitted changes, or restore from the rollback record

### Log Analysis Commands

```bash
# Find all rejected attempts in the last 24 hours
grep '"status":"rejected"' .turpan/mcp-audit.log | grep "$(date -d '1 day ago' +%Y-%m-%d)"

# Count tool calls by tool
grep '"toolName"' .turpan/mcp-audit.log | sed 's/.*"toolName":"\([^"]*\)".*/\1/' | sort | uniq -c | sort -rn

# Get the last 10 successful reviews
grep '"status":"success"' .turpan/mcp-audit.log | tail -10 | jq '{runId, toolName, durationMs, timestamp}'

# Find all runs that took longer than 5 minutes
grep '"status":"success"' .turpan/mcp-audit.log | jq -c 'select(.durationMs > 300000)' | wc -l
```

---

## Compliance Notes

- Turpan does not store any code or findings outside the project's `.turpan/` directory
- All run artifacts are scoped to the project's `.turpan/runs/<runId>/`
- No telemetry or external network calls are made during review (except for UI testing to the project's dev server)
- Secret redaction operates on all output streams: tool responses, logs, and error messages
- Rotated logs preserve redaction (gzip compressed, not re-processed)

---

## Fix Engine Safety Details

The fix engine (`@turpan/fix-engine`) implements these safety guarantees:

1. **Atomic commits** — Each fix is applied as a single atomic file operation
2. **Rollback on failure** — If validation fails, the file is restored from the pre-fix backup
3. **Validation gates** — Build/typecheck/lint must pass before a fix is considered successful
4. **Category policies** — `unsafe` and `manual` category fixes are never auto-applied
5. **Confidence threshold** — Fixes below 70% confidence are never auto-applied
6. **Dirty git guard** — Applies are blocked when the working tree has uncommitted changes (configurable)
