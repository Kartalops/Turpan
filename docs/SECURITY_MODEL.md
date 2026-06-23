# Security Model

This document is the **canonical reference** for Turpan's security posture —
what it does, what it doesn't, and why.

## TL;DR

> **Turpan is read-only by default.** No file in your repo is modified unless
> you explicitly say `apply` or `auto-safe` — and even then, only for "safe"
> fix categories.

## Properties

### Read-only by default

Every command except `turpan fix --apply`, `turpan fix --auto-safe`, and
`turpan fix --interactive` is strictly read-only. None of these reads
modify your code:

- `turpan review` — runs analyzers, writes to `.turpan/runs/`
- `turpan report` — reads artifacts, prints them
- `turpan inspect` — reads files, prints summary
- `turpan doctor` — checks environment
- `turpan ui-test` — spawns dev server, kills it, writes `.turpan/runs/`
- `turpan runtime-test` — runs analyzers
- `turpan agent-audit` — runs analyzer
- `turpan mcp serve` — exposes tools (read-only by default)

Only `turpan fix` can write to your working tree, and only when `--apply`
or `--auto-safe` is passed **and** the working tree is clean.

### No destructive fixes by default

Even with `--fix` or `--patch-only`, Turpan only generates patches. To
apply them:

- `--apply` — applies all eligible fixes (categories marked `auto`)
- `--auto-safe` — applies only the safe subset
- `--interactive` — asks before each fix

Destructive categories (file deletes, dependency changes) are excluded
unless `fix.allowDependencyChanges: true` and `fix.allowFileDeletion: true`
are set in `turpan.yml`.

### No arbitrary code execution during review

The SafeCommandRunner:

- **Never uses `shell: true`.** All commands are parsed into argv and run
  directly via `child_process.spawn`.
- **Never pipes through `sh -c`.** No shell injection surface.
- **Rejects shell operators** by default. Commands containing `;`, `|`,
  `&&`, `||`, `>`, `<`, backticks, or `\\` are blocked at the policy
  layer.
- **Times out every command.** Default 120s, configurable per-command.
- **Redacts secrets from logs.** API keys, tokens, passwords are replaced
  with `[REDACTED]`.

### No destructive UI actions

UI scenarios are explicitly forbidden from:

- **Submitting forms** with real credentials.
- **Clicking buttons** matching `/delete|drop|purge|destroy|remove|wipe/i`.
- **Completing payments.** The billing scenario detects checkout buttons
  but never triggers them.
- **Navigating off-domain.** External links are reported, never followed.
- **Forging tokens.** Auth state is detected, never synthesized.

### Workspace allowlist (MCP)

When started with `--workspace <path>`, the MCP server rejects any
operation that would touch a path outside that directory. Path traversal
attempts (`..`) are blocked at the schema level — the request is rejected
before any code runs.

### Path traversal blocking

Independent of `--workspace`, the MCP server rejects paths containing `..`
segments and absolute paths to system directories (`/etc`, `/var`, `/root`,
`~/.ssh`, etc.). This is enforced by `validateProjectPath()` in
`apps/mcp-server/src/security/workspace.ts`.

### Secret redaction

Every tool output passes through a redaction filter that replaces:

| Pattern                              | Replaced with       |
|--------------------------------------|---------------------|
| `sk-[A-Za-z0-9]{40,}`                | `[REDACTED]`        |
| `sk_live_[A-Za-z0-9]{20,}`           | `[REDACTED]`        |
| `sk_test_[A-Za-z0-9]{20,}`           | `[REDACTED]`        |
| `ghp_[A-Za-z0-9]{30,}`               | `[REDACTED]`        |
| `gho_[A-Za-z0-9]{30,}`               | `[REDACTED]`        |
| `AKIA[0-9A-Z]{16}`                   | `[REDACTED]`        |
| `xox[baprs]-[A-Za-z0-9-]{10,}`       | `[REDACTED]`        |
| `Authorization: Bearer <jwt>`        | `Bearer [REDACTED]` |
| `<digits>:<35+ chars>` (Telegram)    | `[REDACTED]`        |
| `password` / `secret` / `token` assignments | `[REDACTED]`  |

The filter is **conservative** — when in doubt, it redacts.

### Sandboxed run directory

All Turpan artifacts go under `.turpan/`, which is conventionally `.gitignore`d:

```
.turpan/
├── runs/
│   ├── <timestamp>/           # Per-run artifacts
│   │   ├── logs/turpan.log
│   │   ├── screenshots/
│   │   └── *.json / *.md
│   └── latest -> <timestamp>/ # Symlink to most recent
└── evals/                     # Eval suite output
```

`.turpan/` is added to `DEFAULT_IGNORED_DIRS` so analyzers never accidentally
read its own artifacts.

### Process cleanup

Turpan guarantees no orphaned processes:

- **Dev server**: SIGTERM, then SIGKILL after 5s.
- **Browser**: forced close after 5s; full process-group kill on SIGINT.
- **Child commands**: SIGTERM on timeout; tracked per-command.
- **On exit**: best-effort cleanup registered for SIGINT, SIGTERM, exit,
  and uncaughtException.

### Dependency audit — online mode guard

Dependency scanning is **opt-in** and **offline-first**:

- `--dependency-audit` alone uses **no network** — only the bundled vulnerability database.
- `--dependency-audit --online` makes explicit outbound calls to:
  - `https://api.osv.dev/v1/query` (OSV, 8s timeout)
  - `npm audit --json` via local npm CLI (15s timeout)
- All online outputs are **redacted** before any display or storage.
- No online calls are made unless `--online` is explicitly passed.
- Online mode can be permanently disabled via `dependencyAudit.online: false` in `turpan.yml`.

## Threat model

| Threat                                    | Mitigation                                  |
|-------------------------------------------|----------------------------------------------|
| **Malicious input files**                 | All inputs are read as text, never evaluated. |
| **Path traversal via project path**       | Blocked at the schema layer in MCP.           |
| **Shell injection via build/test scripts**| `shell: false` always; argv parsing only.    |
| **Secret leakage in reports**             | Redaction filter applied to every output.    |
| **Unbounded execution**                   | Per-command timeout (default 120s).           |
| **Orphaned processes**                    | SIGKILL on exit, cleanup hooks installed.    |
| **Destructive plugin**                    | Plugins must be explicitly listed; external plugins sandboxed in worker threads. |
| **Destructive UI scenario**               | Forbidden patterns enforced at the framework level. |
| **MCP abuse / accidental DoS**            | Per-tool and global rate limits (default 60/min global, 10–20/min per tool). |
| **Long-running tool starvation**          | Per-tool timeouts (5 min for review, 2 min for reads). |
| **Concurrent review conflicts**           | One active review per workspace; concurrent calls rejected with busy status. |
| **Resource URI path traversal**           | Only `turpan://` protocol allowed; URI validated before handler; blocks `..`, `\`, and malformed URIs. |
| **Audit trail for forensics**              | Every MCP tool call logged to `.turpan/mcp-audit.log` with input/output summary (secrets redacted). |
| **Malicious plugin reads /etc/passwd**    | Sandboxed worker threads; path traversal blocked by sandbox context.         |
| **Plugin timeout / resource exhaustion**  | Per-plugin timeout enforcement (default 30s) in sandbox runner.             |
| **Plugin with excessive permissions**     | Manifest-validated permissions; denied if not in granted list.                |
| **Worker thread crash corrupts parent**   | Phase 29 `sandboxMode: process` runs plugins in a separate OS process.        |
| **Worker thread memory exhaustion**       | Phase 29 `sandboxMode: process` enforces hard heap limit via `--max-old-space-size`. |

## What Turpan does NOT protect against

- **Vulnerabilities in YOUR code** that Turpan doesn't have an analyzer for.
  Use `turpan dependency-audit` for CVE scanning; pair with Snyk, OSV,
  or Bandit for comprehensive coverage.
- **Runtime attacks** — Turpan doesn't deploy or sandbox your code.
- **Supply chain attacks** — Turpan doesn't sign or verify packages.
- **Multi-user safety** — Turpan is a developer tool, not a production
  service.
- **Authenticated abuse** — Rate limiting and concurrency guards add friction
  but cannot prevent a credentialed actor from exhausting resources within
  their quota. Monitor `.turpan/mcp-audit.log` for unusual patterns.

## Known accepted risks (public beta)

| Risk | Acknowledged because |
|------|---------------------|
| Rate limit is per-process, not per-client-token | MCP stdio transport has no per-client auth token concept; process-level limits are the correct enforcement point. |
| Concurrency guard is in-process memory | The guard uses in-process Map; in a multi-process MCP host scenario each process has its own guard. For Claude Code (single host process) this is sufficient. |
| Audit log is append-only | No log rotation is implemented in this phase. For high-volume deployments, external log aggregation should be configured. |
| Timeout auto-releases concurrency slot | If a process is killed before timeout fires, the concurrency slot may be held until the next call detects stale state. |

## Reporting a security issue

Please email security@turpan.dev (or open a private security advisory on
GitHub). We aim to acknowledge within 48 hours.

## Audit checklist

If you're reviewing Turpan for a security audit:

- [ ] Confirm `.turpan/` is in your `.gitignore`.
- [ ] Confirm `turpan fix --apply` is gated by review in CI (the MCP
      server doesn't expose `--apply` to agents).
- [ ] Confirm workspace allowlist is set when running the MCP server
      (`turpan mcp serve --workspace ./my-app`).
- [ ] Confirm your plugins are listed in `turpan.yml` (no implicit loads).
- [ ] Confirm `--timeout` is set to a sane value for your slowest command.
- [ ] Confirm `--ui --skip-scenarios` if you don't want scenarios to run.
- [ ] Review `.turpan/mcp-audit.log` periodically for abuse patterns.
- [ ] Confirm rate limit flags are set appropriately for your usage volume.
- [ ] Confirm resource URI validation is active (`turpan://` only, no traversal).

## See also

- **[MCP Server](./MCP_SERVER.md)** — MCP-specific security.
- **[Safe Usage for MCP](../apps/mcp-server/docs/SAFE_USAGE.md)** — more
  detail on MCP safety.
- **[Fix Engine](./FIX_ENGINE.md)** — safety of the patch generator.
