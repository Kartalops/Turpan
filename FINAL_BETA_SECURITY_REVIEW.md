# Final Beta Security Review

> Phase 30: Public Beta Release Gate
> Date: 2026-06-22
> Version: 0.2.0-beta

---

## Security Verdict

**✅ APPROVED — No critical or high severity issues found.**

Turpan v0.2.0-beta passes all security gates. The safety model is implemented as documented. No bypasses, no unintended destructive behavior, no unmitigated critical threats.

---

## Threat Model Summary

Turpan is a **read-only code review tool by default**. Its threat model centers on three domains:

1. **What Turpan does to your code** — never destructive without consent
2. **What plugins do to your system** — sandboxed by default
3. **What Turpan reports** — redactable, loggable, never exfiltrates

---

## Security Gates

### Read-Only by Default

| Behavior | Default | Verification |
|----------|---------|--------------|
| `turpan review` | Read-only | ✅ No filesystem writes |
| `turpan review --fix` | Prompts | ✅ Confirmation required |
| `turpan fix --apply` | Not default | ✅ Explicit opt-in |
| `turpan dependency-audit --online` | Offline | ✅ No network without flag |
| `turpan ui-test` | DRY-RUN | ✅ No destructive clicks |

### Plugin Sandboxing

| Property | Worker (default) | Process (opt-in) |
|----------|-----------------|-----------------|
| V8 heap isolation | ❌ Same process | ✅ Separate V8 |
| OS process boundary | ❌ Same process | ✅ Separate |
| Hard memory limit | ❌ Soft only | ✅ `--max-old-space-size` |
| Event loop isolation | ❌ Shared | ✅ Separate |
| Timeout enforcement | ⚠️ terminate() | ✅ SIGKILL |
| Env var stripping | ⚠️ Minimal | ✅ Explicit allowlist |
| Manifest validation | ✅ | ✅ |
| Path traversal blocking | ✅ | ✅ |

**Sandbox implementation**: `packages/core/src/plugins/sandbox/`
- `PluginSandbox.ts` — base interface
- `sandboxWorker.ts` — worker thread implementation
- `PluginProcessSandbox.ts` — child_process implementation
- `sandboxRunner.ts` — security enforcement (path traversal, command safety)
- `permissions.ts` — permission system
- `manifestValidator.ts` — manifest schema + semver validation
- `trustDb.ts` — trust database

### MCP Server Security

| Property | Status | Implementation |
|----------|--------|----------------|
| Audit logging | ✅ | `audit-logger.ts` — every call logged |
| Rate limiting | ✅ | `rate-limiter.ts` — 60/min global, 20/min review, 10/min UI |
| Concurrency guard | ✅ | `concurrency-guard.ts` — stale lock release |
| Workspace isolation | ✅ | Path allowlist + prefix checking |
| MCP run index | ✅ | Append-only `.turpan/mcp-runs.jsonl` |
| Secret redaction | ✅ | Keys/passwords redacted from all logs |
| Crash isolation | ✅ | Per-call try/catch, restart on crash |

### Dependency Audit Security

| Property | Status | Implementation |
|----------|--------|----------------|
| Offline by default | ✅ | No network without `--online` |
| SBOM generation | ✅ | CycloneDX + JSON |
| License scanning | ✅ | Allowlist/blocklist + SPDX database |
| Vulnerability DB | ✅ | local `vulndb.ts` + optional online |
| No code execution | ✅ | Parse-only, no eval |

### UI Testing Security

| Property | Status | Implementation |
|----------|--------|----------------|
| Destructive action detection | ✅ | Keywords: delete, drop, purge, truncate |
| Destructive action blocking | ✅ | Never clicked, only logged |
| Test user DRY-RUN | ✅ | Default: `testUser.enabled = false` |
| No credentials persisted | ✅ | `passwordStored: false` |
| No real payments | ✅ | Billing always disabled in beta |
| Playwright sandbox | ✅ | Browser in sandboxed mode |

---

## Phase 22 Security Properties (Worker Thread Sandbox)

Verified implementation:
- Plugin manifest validation (name, version, permissions, resources)
- Worker thread creation with typed message protocol
- **Path traversal blocking**: URLs, paths with `..`, absolute paths outside project
- **Command execution blocking**: `rm`, `del`, `format`, shell metacharacter injection
- **Plugin permission enforcement**: filesystem, network, exec, env
- **Graceful failure**: malformed plugin responses → termination
- **Sandbox runner**: security checks for every file access and command execution

---

## Phase 29 Security Properties (Process Sandbox, opt-in)

Verified implementation:
- Child process with explicit `--max-old-space-size=256`
- **IPC over stdio**: JSON-only protocol, strict schema validation
- **Manifest validation in child**: semver check, max 20 chars name, max 50 permissions
- **Timeout kill**: SIGKILL after timeout (harder to bypass than terminate())
- **Output cap**: 1MB max, cap checked BEFORE ready handler (race condition fixed)
- **Env var stripping**: API keys, tokens, secrets explicitly removed
- **EPIPE suppression**: stdin write errors from killed children suppressed
- **Permission bridge**: 8 permissions mirrored to child environment

---

## Dependency Audit Security Properties

| Property | Implementation |
|----------|---------------|
| No exec during SBOM | ✅ Parse-only `package.json` and lockfile |
| No arbitrary code eval | ✅ Package content scanned, not executed |
| SBOM format | ✅ CycloneDX 1.4 JSON |
| Vulnerability data | ✅ Local SQLite + optional online NVD API |
| License detection | ✅ SPDX expression parsing + blocklist |

---

## What Turpan Does NOT Do

These are explicitly out-of-scope and are NOT security issues:

| Claim | Verified |
|-------|----------|
| Does NOT run arbitrary code without explicit plugin consent | ✅ |
| Does NOT make network calls without `--online` flag | ✅ |
| Does NOT store credentials (test user always DRY-RUN) | ✅ |
| Does NOT modify code without `--fix --apply` | ✅ |
| Does NOT click destructive buttons in UI tests | ✅ |
| Does NOT exfiltrate code to external servers | ✅ |
| Does NOT run in CI without explicit config | ✅ |
| Does NOT load untrusted plugins without sandbox | ✅ |

---

## Security Review Checklist

- [x] No `eval()` or `Function()` usage on untrusted input
- [x] No `child_process.exec` / `execSync` with shell interpolation
- [x] All file paths validated (no `..` traversal)
- [x] No hardcoded credentials in source
- [x] All secrets redacted from logs/stdout
- [x] Plugin sandbox verified (worker + process)
- [x] Rate limiting implemented and tested
- [x] Audit logging for all MCP calls
- [x] No destructive behavior without explicit opt-in
- [x] UI test destructive button detection works
- [x] `testUser.enabled = false` by default
- [x] Dependency audit is offline by default
- [x] Fix engine requires `--apply` confirmation
- [x] Review-diff is read-only

---

## Known Accepted Risks

1. **Append-only run index** — `.turpan/mcp-runs.jsonl` grows unbounded. Recommend periodic archival/culling. Not a security issue but a storage concern.

2. **Worker thread mode** — Same V8 heap as parent. Process mode (`sandboxMode: process`) provides stronger isolation for untrusted plugins.

3. **Eval baseline detection gaps** — 13 pre-existing static analysis detection gaps. Not security vulnerabilities.

4. **UI tests require browser** — Playwright runs in headed mode by default. Headless mode available via config.

5. **Plugin manifest trust** — Plugins self-declare permissions. Untrusted plugins should use `sandboxMode: process`.

---

## Phase 28/29 Security Properties Verified

| Property | Phase | Status |
|----------|-------|--------|
| Audit log appends on every call | 28 | ✅ |
| Concurrency stale lock release | 28 | ✅ |
| Rate limit enforcement | 28 | ✅ |
| MCP status command works | 28 | ✅ |
| Plugin process IPC protocol | 29 | ✅ |
| Child process timeout kill | 29 | ✅ |
| Env secret stripping | 29 | ✅ |
| Output cap enforcement | 29 | ✅ |
| Manifest validation | 29 | ✅ |
