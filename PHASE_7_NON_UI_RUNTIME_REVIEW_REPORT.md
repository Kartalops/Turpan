# Phase 7: Non-UI Runtime Review — Implementation Report

## Summary

Implemented Non-UI Runtime Review for Turpan, enabling safety-focused runtime analysis of Python bots, FastAPI backends, Node.js servers, CLI tools, workers, and MCP servers. Runtime analyzers run safe import/syntax checks, detect security vulnerabilities, and probe server endpoints — without executing destructive commands, sending real messages, or calling production APIs.

---

## Files Created

### Runtime Analyzers (`packages/core/src/analyzers/runtime/`)

| File | Purpose |
|---|---|
| `PythonRuntimeAnalyzer.ts` | Python bot/worker safety review |
| `FastApiRuntimeAnalyzer.ts` | FastAPI backend runtime review |
| `NodeBackendRuntimeAnalyzer.ts` | Express/Fastify/NestJS backend review |
| `CliRuntimeAnalyzer.ts` | CLI tool help/version/exit code validation |
| `WorkerRuntimeAnalyzer.ts` | Celery/RQ/BullMQ worker pattern review |
| `McpRuntimeAnalyzer.ts` | MCP server security audit |
| `index.ts` | Barrel export |

### Test Fixtures (`packages/core/tests/fixtures/runtime/`)

| Fixture | Contents |
|---|---|
| `python-bot/syntax_ok.py` | Valid bot with fake token, proper structure |
| `python-bot/bot_with_issues.py` | Hardcoded secret, infinite loop, bare except, async blocking, webhook+polling ambiguity |
| `fastapi-app/main.py` | FastAPI app with wildcard CORS |
| `cli-tool/cli.py` | Click-based CLI with --help and --version |
| `mcp-server/unsafe_server.ts` | MCP server with arbitrary shell, unrestricted FS, no workspace allowlist |

### Tests

- `packages/core/tests/runtime-analyzers.test.ts` — unit tests for all runtime analyzers

### CLI Integration

- `apps/cli/src/commands/runtimeTest.ts` — `turpan runtime-test` command
- Updated `apps/cli/src/commands/review.ts` — `--runtime` flag
- Updated `apps/cli/src/index.ts` — shell intent patterns for runtime review commands

### Orchestrator Integration

- `packages/core/src/runner/stages/runtimeStage.ts` — new `runtime` stage wired into ReviewOrchestrator
- Updated `packages/core/src/orchestrator/ReviewStage.ts` — `StageId` union includes `'runtime'`
- Updated `packages/core/src/orchestrator/ReviewOrchestrator.ts` — `skipRuntime` and `skipUi` options
- Updated `packages/core/src/orchestrator/index.ts` — `OrchestratorOptions` extended with `skipUi`, `skipRuntime`

### Type System Updates

- `packages/core/src/findings/Finding.ts` — `Category` union extended with `'runtime'`, `'api-design'`
- `packages/core/src/findings/Evidence.ts` — `EvidenceType` union extended with `'text'`
- `packages/shared/src/types/index.ts` — mirrored `'runtime'`, `'api-design'`, `'text'` additions

---

## What Each Analyzer Does

### PythonRuntimeAnalyzer
- **Entrypoint detection**: main.py, bot.py, app.py, run.py, src/* variants
- **Requirements detection**: requirements.txt, pyproject.toml, uv.lock
- **Syntax check**: `python -m py_compile` on target files
- **Tool discovery**: pytest, ruff, mypy — runs collect-only/lint/typecheck safely
- **Pattern detection**:
  - Hardcoded secrets (tokens, passwords, API keys)
  - Infinite loops without break/shutdown signal
  - Unsafe eval/exec/`__import__`
  - Bare `except: pass` without logging
  - Blocking calls (`time.sleep`) inside async functions
  - API calls without try/except
  - Network calls without retry/backoff
  - Webhook + polling ambiguity
  - Bot initialized without registered handlers
  - Missing `if __name__ == "__main__"` guard

### FastApiRuntimeAnalyzer
- **Import check**: `python -c 'from module import app'` variants
- **Server startup**: starts uvicorn on random high port (49xxx)
- **Endpoint probing**: `/`, `/health`, `/healthz`, `/ready`, `/docs`, `/openapi.json`
- **Static detection**:
  - Wildcard CORS (`allow_origins=["*"]`) — critical security
  - Missing rate limiting (no slowapi/aioli/limiter)
  - Missing structured errors (no HTTPException)
  - Missing error middleware

### NodeBackendRuntimeAnalyzer
- **Syntax check**: `node --check` on entrypoint
- **Import check**: `node -e "require('entrypoint')"`
- **Pattern detection**:
  - Missing `process.on('unhandledRejection')` handler
  - Missing `process.on('uncaughtException')` handler
  - Missing Express error middleware (4-arg route handler)
  - Sync cron without a robust scheduler library

### CliRuntimeAnalyzer
- **Entrypoint detection**: package.json bin, pyproject.toml [project.scripts], Python CLI files
- **Help check**: runs `<cmd> --help`, validates exit code 0 and non-empty output
- **Version check**: runs `<cmd> --version`
- **Command registration check**: commander/yargs without `.parse()`, Click/Typer without app invocation

### WorkerRuntimeAnalyzer
- **Framework detection**: Celery, RQ, BullMQ via file content and package.json
- **Pattern detection**:
  - Missing retry configuration (no `autoretry_for`, `max_retries`, `retry` option)
  - Missing dead-letter queue (no DLQ config)
  - Missing idempotency checks
  - Missing graceful shutdown (no SIGTERM/SIGINT handler)
  - Missing `task_acks_late` / `task_reject_on_worker_lost` (Celery visibility)
  - Missing `lockDuration` / `removeOnComplete` (BullMQ visibility timeout)

### McpRuntimeAnalyzer
- **Server detection**: @modelcontextprotocol imports, mcp-server filename patterns
- **Security findings**:
  - Arbitrary shell execution (`child_process.exec` with user input, `bash -c`)
  - Unrestricted filesystem access (no path validation on readFile/writeFile params)
  - Missing workspace allowlist (no `allowedPaths`, `isInWorkspace`, `realpath` checks)
  - Missing input schema validation on tools
  - SQL injection in tool handlers (string concatenation in queries)
  - Secret leakage in tool responses (returning tokens/passwords in responses)
  - Overly broad schemas (empty `inputSchema: {}`, `type: "any"`)

---

## Safety Guarantees

All runtime analyzers follow these constraints:

1. **No destructive commands**: `rm`, `DROP DATABASE`, `pkill`, etc. are blocked by SafeCommandRunner policy
2. **No real external calls**: Telegram bots, Slack webhooks, payment APIs are never called with real credentials
3. **Fake tokens only**: Test fixtures use obviously fake tokens (`123456789:FAKE_TOKEN`, `sk-...` with invalid format)
4. **Dry-run where possible**: pytest runs `--collect-only`, ruff runs `check --output-format=json`, mypy runs on file list
5. **Random high ports**: FastAPI server starts on 49000–49100 to avoid collision with production
6. **Import-only for workers**: WorkerRuntimeAnalyzer validates imports and configuration, never enqueues real jobs

---

## CLI Usage

```bash
# Dedicated runtime review command
turpan runtime-test .

# Review with runtime stage included
turpan review . --runtime

# Review with all stages except UI
turpan review . --skip-ui

# Interactive shell
turpan
  > test this Python bot
  > review this backend
  > check this MCP server
```

---

## Validation

```bash
# TypeScript
pnpm run build  # ✓ all packages build cleanly

# Tests
pnpm test        # runtime analyzer tests pass

# CLI
turpan --help     # shows runtime-test command
turpan runtime-test --help
```

---

## Final Verdict

**READY** — all runtime analyzers implemented, wired into orchestrator, type-safe, CLI integrated, tests added, build passes cleanly.
