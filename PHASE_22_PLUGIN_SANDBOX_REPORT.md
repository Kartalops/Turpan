# Phase 22: Plugin Sandboxing and Trust Boundaries

## Summary

Implemented a plugin sandboxing and trust boundary system for Turpan. External
plugins now run in isolated worker threads with permission-gated operations,
manifest validation, timeout enforcement, and sanitized output. Built-in plugins
continue to run in-process with full Node.js privileges.

## What was implemented

### 1. Plugin trust model

Three trust levels defined in `packages/core/src/plugins/sandbox/types.ts`:

- **`builtin`**: Bundled with `@turpan/core` (next, vite, python, saas, mcp, security-basic).
  Always loaded, always full permissions, cannot be changed.
- **`local-trusted`**: Explicitly trusted via `turpan plugins trust` CLI or config override.
  Sandboxed worker thread, restricted API surface, configurable permissions.
- **`external-untrusted`**: Default for any external plugin loaded from node_modules.
  Sandboxed worker thread, minimal default permissions (read-package-metadata, run-analysis-only).

### 2. Plugin permissions

Eight granular permissions defined in `packages/core/src/plugins/sandbox/permissions.ts`:

| Permission | Description |
|---|---|
| `read-project-files` | Read project source files |
| `read-package-metadata` | Read package.json and dependencies |
| `run-analysis-only` | Run analyzers, no file writes |
| `propose-fixes` | Propose fixes for review |
| `ui-scenarios` | Run UI test scenarios |
| `read-config` | Read turpan.yml config |
| `network-fetch` | Make outbound HTTP requests |
| `run-commands` | Run sandboxed CLI commands |

### 3. Config (`turpan.yml`)

Added `security.plugins` section to `turpan.yml` and config parser:

```yaml
security:
  plugins:
    allowExternal: false        # default: false
    sandboxExternal: true      # default: true
    maxPluginRuntimeMs: 30000  # default: 30000
    memoryCapMb: 256           # default: 256
    localTrustedPermissions:
      - read-project-files
      - read-package-metadata
      - run-analysis-only
      - propose-fixes
      - ui-scenarios
      - read-config
    externalUntrustedPermissions:
      - read-package-metadata
      - run-analysis-only
    pluginTrust:
      my-plugin:
        level: local-trusted
        permissions:
          - read-project-files
          - run-analysis-only
```

### 4. Manifest validation (`manifestValidator.ts`)

Required fields: `id` (kebab-case), `version` (semver), `name`.
Warns on missing `description` and missing `contributes`.
Rejects unknown permissions, invalid semver, and malformed IDs.

### 5. Sandbox execution (`PluginSandbox.ts`, `sandboxWorker.ts`)

- External plugins loaded in `worker_threads` with `shell: false`
- Worker gets minimal env vars (no secrets)
- Plugin module re-imported inside worker; validated before use
- Timeout enforced via `setTimeout` + `worker.terminate()`
- Abort signal wired to worker termination

### 6. Sandboxed plugin context (`sandboxRunner.ts`)

Injected into sandboxed plugins instead of the full Node.js API:

- `readFile(path)` — allowed only for permitted extensions in allowlist
- `readFileIfAllowed(path, permission)` — permission-gated
- `fileExists(path)` — allowlist-scoped
- `listDir(path)` — allowlist-scoped
- `getPackageJson()` — allowed only with `read-package-metadata`
- `getDependencies()` — convenience wrapper
- `createFinding(partial)` — always injects `pluginId` and `detectedAt`
- `timeRemainingMs()` — for plugins to self-check timeout

Path traversal (`../`, `..`, absolute `/etc/passwd`) is blocked by:
1. Resolving to absolute path and checking `relative(projectRoot, path)` doesn't start with `..`
2. Checking against scoped allowlist

### 7. Command sanitization (`sandboxRunner.ts`)

- Allowed command allowlist: `pnpm`, `npm`, `yarn`, `bun`, `git`, `node`, `npx`, `python`, `pip`, `uv`, `docker`, `docker-compose`
- Dangerous patterns blocked: `rm -rf /`, `sudo`, `curl|wget pipe to shell`, `dd`, `mkfs`, `passwd`, etc.
- Output truncated at 50,000 chars
- Secrets redacted from output

### 8. Trust database (`trustDb.ts`)

Persisted to `.turpan/trust-db.json`. Stores:
- `id`, `trustLevel`, `grantedPermissions[]`, `trustedSince`, `trustedBy`, `notes`

Built-in plugins pre-seeded in `defaults.ts` and cannot be overridden.

### 9. PluginLoader changes

Updated `loadExternalPlugin` to:
1. Return `{ instance, path, manifest }` instead of just `Plugin`
2. Check `allowExternal` before loading any external plugin
3. Determine trust level and granted permissions per plugin
4. Run external plugins through `runSandboxedPlugin` when `sandboxExternal: true`
5. Direct (non-sandboxed) load only when `sandboxExternal: false` AND fully trusted

### 10. CLI commands

- `turpan plugins trust <id> [--level <level>] [--permissions <perms...>] [--notes <notes>]`
- `turpan plugins trust <id> --revoke` — removes from trust DB
- `turpan plugins permissions [--json]` — shows all available permissions

### 11. Tests (`sandbox.test.ts`)

Coverage for:
- Manifest validation (valid, missing fields, invalid semver, unknown permissions, kebab-case)
- Permission checking (`isPermissionGranted`, `allPermissionsGranted`)
- Command safety (`isCommandAllowed`, `isDangerousCommand`, `sanitizeCommandOutput`)
- Sandbox context (path traversal blocked, permission gates, finding injection, timeout)
- Default trusted plugins
- Permission completeness

## Threat model

| Threat | Mitigation |
|---|---|
| Malicious plugin reads `/etc/passwd` | Worker thread isolation; sandbox `readFile` blocks `../` and system paths |
| Plugin runs forever (resource exhaustion) | Per-plugin timeout (default 30s) enforced via `worker.terminate()` |
| Plugin returns malformed/corrupted findings | `createFinding` always injects `pluginId` and `detectedAt`; output sanitized |
| Plugin requests unauthorized permission | Manifest validated; missing permissions cause rejection before load |
| Plugin executes dangerous shell commands | `isCommandAllowed` allowlist + `isDangerousCommand` pattern blocklist |
| Plugin gets excessive permissions by default | External-untrusted gets minimal defaults; local-trusted requires explicit CLI grant |
| Path traversal via absolute path | Sandbox `readFile` resolves to absolute, checks `relative()` doesn't escape projectRoot |
| Secrets leaked through plugin output | `sanitizeCommandOutput` redacts token patterns; findings pass through `createFinding` |

## Sandbox design

```
┌─────────────────────────────────────────────────────┐
│                    Main Process                      │
│  PluginLoader                                        │
│    ├─ Builtin plugin → register() in-process        │
│    └─ External plugin                                │
│          ├─ allowExternal check  ────────────────── ✗ │
│          ├─ loadExternalPlugin()                    │
│          ├─ validatePluginManifest()                 │
│          ├─ check permissions vs granted             │
│          └─ runSandboxedPlugin()                    │
│               └─ new Worker(workerData)              │
│                    └─ sandboxWorker.ts               │
│                         ├─ import(pluginPath)        │
│                         ├─ isPlugin() check         │
│                         ├─ manifest.id match         │
│                         ├─ plugin.supports(fp)       │
│                         └─ postMessage(plugin)       │
└─────────────────────────────────────────────────────┘

Sandboxed plugin context (injected, not raw Node.js):
  readFile()       → permission + allowlist + extension check
  readFileIfAllowed() → permission gate + readFile
  fileExists()     → allowlist scoped
  listDir()        → permission + allowlist
  getPackageJson() → permission + allowlist
  getDependencies() → getPackageJson wrapper
  createFinding()  → always injects pluginId + detectedAt
  timeRemainingMs() → calculated from worker start time
```

## Files changed/created

| File | Change |
|---|---|
| `packages/core/src/plugins/sandbox/PluginSandbox.ts` | **New** — main sandbox runner |
| `packages/core/src/plugins/sandbox/sandboxWorker.ts` | **New** — worker thread entry |
| `packages/core/src/plugins/sandbox/sandboxRunner.ts` | **New** — sandboxed context + command safety |
| `packages/core/src/plugins/sandbox/permissions.ts` | **New** — permission registry |
| `packages/core/src/plugins/sandbox/types.ts` | **New** — shared types |
| `packages/core/src/plugins/sandbox/manifestValidator.ts` | **New** — manifest validation |
| `packages/core/src/plugins/sandbox/trustDb.ts` | **New** — persistent trust DB |
| `packages/core/src/plugins/sandbox/defaults.ts` | **New** — built-in plugin trust entries |
| `packages/core/src/plugins/sandbox/index.ts` | **New** — public exports |
| `packages/core/src/plugins/sandbox/sandbox.test.ts` | **New** — tests |
| `packages/core/src/plugins/PluginLoader.ts` | **Updated** — sandbox integration |
| `packages/core/src/config/index.ts` | **Updated** — plugin security config parsing |
| `packages/shared/src/types/index.ts` | **Updated** — `PluginPermission`, `PluginTrustLevel`, `PluginSecuritySubConfig` types |
| `apps/cli/src/commands/plugins.ts` | **Updated** — `trust`, `permissions` commands |
| `turpan.yml` | **Updated** — `security.plugins` section |
| `docs/SECURITY_MODEL.md` | **Updated** — threat model table |
| `docs/PLUGINS.md` | **Updated** — trust levels, permissions, sandboxing, CLI |
| `docs/CONFIGURATION.md` | **Updated** — `security.plugins` field reference |
| `PHASE_22_PLUGIN_SANDBOX_REPORT.md` | **New** — this report |

## Accepted remaining risks

| Risk | Acknowledged because |
|---|---|
| Worker thread still runs in same OS process — not a true OS-level sandbox | Worker threads share the Node.js event loop; memory caps are soft (enforced by V8/worker-memlimit if configured). True process isolation would require `child_process` with IPC, which adds significant complexity. Worker thread isolation is sufficient against casual misuse. |
| `network-fetch` permission still allows outbound HTTP from worker | Worker thread has access to `fetch`/`http` module inside the worker context. This is inherent to the Node.js worker thread model. Mitigation: `network-fetch` is not in the default permission sets; it requires explicit grant. |
| Memory cap is soft (not enforced by the sandbox itself) | The `memoryCapMb` config is advisory/pass-through to worker options. V8's `--max-old-space-size` applies to the whole process. For hard memory limits, a separate process with `child_process` + IPC would be needed. |
| Built-in plugins still run in-process with full privileges | By design — built-in plugins are bundled with `@turpan/core` and trusted. The threat model assumes `@turpan/core` itself is trusted. |
| Trust DB (`.turpan/trust-db.json`) is not cryptographically signed | The trust DB is a local JSON file in the project directory. It is suitable for single-user developer workflows. Multi-user/CI scenarios should rely on `pluginTrust` in `turpan.yml` which can be reviewed in version control. |
| Plugin `supports()` can still execute arbitrary code during plugin selection | The `supports()` call runs in the worker (sandboxed) or in-process (builtin). For sandboxed plugins, this is limited to the sandboxed context. This is a pre-existing risk not introduced by this phase. |
