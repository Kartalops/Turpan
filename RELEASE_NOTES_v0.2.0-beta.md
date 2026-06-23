# Release Notes — Turpan v0.2.0-beta

> **Public Beta Release**
> Date: 2026-06-22
> Version: 0.2.0-beta

---

## What's New in v0.2.0-beta

This is the **public beta** release of Turpan. It includes 6 phases of work since the initial internal release, bringing plugin sandboxing, dependency auditing, authenticated SaaS testing, MCP hardening, and process isolation.

### 🎯 New: Plugin Process Isolation (Phase 29)

External plugins can now run in a **child process sandbox** for stronger isolation:

```yaml
# turpan.yml
security:
  plugins:
    sandboxMode: process  # opt-in stronger isolation
```

- Separate V8 heap, OS process boundary, SIGKILL timeout
- Explicit environment allowlist (no inherited secrets)
- Manifest validation in child process
- 1MB output cap, JSON-only IPC protocol

Worker thread mode (`sandboxMode: worker`) remains the default for developer ergonomics.

### 🔒 New: MCP Operational Hardening (Phase 28)

The MCP server is now production-hardened:

- **Audit logging** — every MCP call appended to `.turpan/audit/audit-YYYY-MM-DD.log`
- **Concurrency guard** — stale lock auto-release after 5 minutes + 30s grace
- **Rate limiting** — 60 calls/min global, 20/min review, 10/min UI test
- **Run index** — append-only `.turpan/mcp-runs.jsonl` for billing/audit
- **Workspace isolation** — path allowlist enforced

### 🛡️ New: Authenticated SaaS Testing (Phase 27)

Test SaaS flows that require login:

```bash
turpan scenarios test-auth   # show current auth config
# Set in turpan.yml:
# testUser:
#   enabled: true
#   email: your-test@email.com
#   loginPath: /auth/signin
#   dashboardPath: /dashboard
```

- **DRY-RUN by default** — `testUser.enabled: false`, never runs without explicit config
- Password stored in memory only (`passwordStored: false`), never persisted
- Authenticated routes tested after login
- No real payments — billing always disabled in beta

### 📦 New: Dependency Audit (Phase 26)

Scan dependencies for vulnerabilities and license issues:

```bash
turpan dependency-audit .              # offline (default)
turpan dependency-audit . --online      # with NVD vulnerability database
```

- **SBOM generation** — CycloneDX 1.4 JSON + custom JSON
- **License scanning** — SPDX allowlist/blocklist
- **Offline by default** — no network calls without `--online`
- ** CycloneDX support** — standard SBOM format for toolchain integration

### 🧩 Plugin Sandboxing (Phase 22)

External plugins run in a sandboxed environment:

- Worker thread isolation (V8 heap shared but memory-managed)
- Manifest validation: name, version, permissions, resources
- Path traversal blocking — no filesystem access outside project
- Command blocking — no `rm`, `del`, `format` execution
- Plugin permission system: filesystem, network, exec, env

---

## What's Changed

### `turpan mcp status` now shows more detail

```
turpan mcp status
```

Output now includes:
- Total recorded runs count (from `.turpan/mcp-runs.jsonl`)
- Stale lock timeout and grace period
- Rate limit configuration
- Audit log path and rotation settings

### CLI progress clearing fixed

Progress indicators no longer throw `chalk16.clear is not a function` errors in terminal environments that don't support ANSI escapes.

### Phase references removed from user-facing docs

Documentation no longer references internal phase numbers for completed work. Phase references remain only in internal design docs.

---

## Breaking Changes

None. This is a beta release with no previous public API.

---

## Deprecations

None in v0.2.0-beta.

---

## Known Issues

| Issue | Severity | Workaround |
|-------|----------|------------|
| `turpan mcp serve --help` doesn't show all options | Low | Options work; help text incomplete |
| UI tests: `ReferenceError: require is not defined` | Low | Use `--ui` with caution |
| Parallel build can fail (TS5055) | Low | Build core first: `pnpm -F @turpan/core build` |
| 13 eval fixtures FAIL (pre-existing baseline) | Low | Static analysis gaps, not bugs |
| Git test flaky (~1/10 runs) | Low | Retry |

---

## Installation

```bash
npm install -g @turpan/cli     # coming soon
# or
pnpm add @turpan/cli
# or
npx turpan doctor
```

---

## Upgrade from v0.1.x

There is no previous public version. If you were using an internal preview:

```bash
# Pull latest
pnpm install

# Re-initialize (optional — turpan.yml is backward-compatible)
turpan init

# Verify
turpan doctor
```

---

## What's Next

See [PUBLIC_BETA_GO_NO_GO.md](./PUBLIC_BETA_GO_NO_GO.md) for the full release gate decision and [FINAL_BETA_PRODUCT_READINESS.md](./FINAL_BETA_PRODUCT_READINESS.md) for the product roadmap.
