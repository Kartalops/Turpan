# Phase 19: MCP Hardening — Implementation Report

**Date:** 2026-06-20
**Goal:** Harden the MCP server for public beta launch
**Status:** ✅ Complete

---

## Summary

Phase 19 adds operational controls to the Turpan MCP server: audit logging, per-tool rate limiting with configurable CLI flags, resource URI hardening (path traversal blocking), per-tool timeouts with structured timeout errors, and a concurrency guard that prevents simultaneous review runs in the same workspace. All changes are additive — the server remains read-only by default.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/security/audit-logger.ts` | **New** — structured audit log for every MCP tool call |
| `apps/mcp-server/src/security/rate-limiter.ts` | **New** — per-process sliding-window rate limiter |
| `apps/mcp-server/src/security/concurrency-guard.ts` | **New** — one-active-review-per-workspace guard |
| `apps/mcp-server/src/security/timeouts.ts` | **New** — per-tool timeout wrapper with structured errors |
| `apps/mcp-server/src/server.ts` | Updated — wires in all 4 hardening layers; added URI validation |
| `apps/mcp-server/src/index.ts` | Updated — added `--max-calls-per-minute`, `--max-tool-calls-per-minute`, `--max-review-calls-per-minute`, `--max-ui-test-calls-per-minute` CLI flags |
| `apps/mcp-server/tests/security-hardening.test.ts` | **New** — 39 tests covering all hardening features |
| `docs/MCP_SERVER.md` | Updated — added Operational Controls section, new CLI flags |
| `docs/SECURITY_MODEL.md` | Updated — threat model, accepted risks, audit checklist |

---

## New Components

### 1. Audit Logger (`audit-logger.ts`)

Every MCP tool call is logged to `.turpan/mcp-audit.log` (global) and `.turpan/runs/<runId>/mcp-audit.jsonl` (workspace-scoped). Each entry contains:

- `timestamp` (ISO 8601), `toolName`, `projectPath`, `workspace`
- `sessionId`, `callerId`, `runId` (auto-generated per review run)
- `inputSummary` — full args with `redactObject()` applied (sensitive env var names → `[REDACTED]`)
- `outputSummary` — truncated to 500 chars to prevent log flooding
- `status` — `success | failure | rejected | timeout`
- `durationMs`, `errorCode`

The audit log is append-only and non-blocking (write failures are swallowed).

### 2. Rate Limiter (`rate-limiter.ts`)

Sliding-window rate limiter with two tiers:

- **Global limit** — `60 calls/minute` per MCP client process (configurable)
- **Per-tool limit** — 10–20 calls/minute depending on tool cost (configurable per tool)

Rate limit errors return a structured JSON response:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for tool 'turpan.review_project': 20 calls per minute",
    "retryAfterMs": 45000,
    "limit": 20,
    "toolName": "turpan.review_project"
  }
}
```

### 3. Resource URI Hardening

`server.ts` now validates every resource URI before passing it to the handler:

1. Must start with `turpan://` — all other protocols rejected
2. Path segment must not contain `..` or `\` (blocks path traversal)
3. Must match `^turpan://runs/[a-zA-Z0-9_:-]+/[a-zA-Z0-9_.]+$`

This prevents malicious URIs like `file:///etc/passwd`, `turpan://runs/../../../etc/passwd`, or `javascript:alert(1)`.

### 4. Tool Timeouts (`timeouts.ts`)

Default timeouts per tool class:

| Tool class | Default | Rationale |
|------------|---------|-----------|
| `review_project`, `review_diff`, `live_ui_test`, `agent_output_audit`, `fix_findings` | 5 min | Long analysis workflows |
| `get_report`, `get_findings` | 2 min | Short read operations |

Timeout returns structured error:
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

### 5. Concurrency Guard (`concurrency-guard.ts`)

Only one review-writing tool can run per workspace at a time. Write tools are: `review_project`, `review_diff`, `live_ui_test`, `agent_output_audit`. The guard is in-process (in-memory `Map`). Second concurrent calls return busy status:

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

The slot is auto-released on timeout (5 min + 1 s buffer) or normal completion.

---

## Threat Model Updates

Added 5 new threat mitigations to `SECURITY_MODEL.md`:

| New threat | Mitigation |
|------------|-----------|
| MCP abuse / accidental DoS | Per-tool + global rate limits (60/min global, 10–20/min per tool) |
| Long-running tool starvation | Per-tool timeouts (5 min / 2 min) |
| Concurrent review conflicts | One active review per workspace |
| Resource URI path traversal | Protocol allowlist, traversal blocking, URI regex validation |
| Audit trail for forensics | Structured JSON-Lines log to `.turpan/mcp-audit.log` |

---

## Tests Added

**39 new tests** in `security-hardening.test.ts`:

| Test suite | Coverage |
|------------|---------|
| `AuditLogger` | succeed/fail/reject/timeout entries; unique runId generation |
| `RateLimiter` | global limit; per-tool limit; sliding window reset; status; toJSON |
| `ConcurrencyGuard` | claim; block second claim; multi-workspace independence; release; releaseByRunId |
| `Timeouts` | fast resolve; timeout rejection; ToolTimeoutError properties; getTimeoutForTool |
| `Redaction in audit logs` | secrets redacted in inputSummary; outputSummary truncation |
| `Resource URI validation` | valid URIs; non-turpan protocol; path traversal; backslash; malformed; null bytes; javascript: |
| `redactObject for audit input` | sensitive env vars; nested; arrays |

**Result:** 108/108 tests passing.

---

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Build | `pnpm build` | ✅ Pass (all packages) |
| Lint | `pnpm lint` | ⚠️ Pre-existing tsconfig issues (TS6306: referenced projects need `composite: true`) — not introduced by Phase 19 |
| Tests | `pnpm test` | ✅ 108/108 pass |
| Eval | `pnpm eval` | ⚠️ Pre-existing eval failures (analyzers not producing expected findings) — Phase 19 is MCP infrastructure only |

---

## Known Accepted Risks (Public Beta)

| Risk | Rationale |
|------|-----------|
| Rate limit is per-process, not per-client-token | MCP stdio has no per-client auth token concept; process-level limits are the correct enforcement point |
| Concurrency guard is in-process memory | Sufficient for Claude Code single-host scenario; multi-process hosts need external coordination |
| Audit log is append-only | No rotation in this phase; external log aggregation recommended for high-volume deployments |
| Timeout auto-releases concurrency slot | If process killed before timeout fires, slot held until next call detects stale state |

---

## Public Beta Readiness Impact

Phase 19 reduces the following risks for public beta:

1. **Accidental DoS** — a runaway agent or misconfiguration can no longer spam the server unbounded
2. **Resource starvation** — long-running reviews can't block other clients indefinitely
3. **Path traversal via resource URIs** — `turpan://` protocol enforcement prevents filesystem access outside `.turpan/runs/`
4. **Audit trail absence** — every call is now logged with runId for forensic reconstruction
5. **Concurrency conflicts** — explicit busy response with runId prevents silent queue buildup

The MCP server was already read-only by default with workspace scoping. Phase 19 adds the operational controls needed for a multi-tenant or high-frequency deployment scenario.

---

## Final Verdict

**READY** — All 7 required deliverables implemented and tested. Lint failures are pre-existing tsconfig issues. Eval failures are pre-existing analyzer coverage gaps unrelated to MCP hardening.
