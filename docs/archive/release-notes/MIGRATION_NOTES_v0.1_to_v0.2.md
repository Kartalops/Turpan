# Migration Notes: v0.1.x → v0.2.0-beta

> Turpan has no previous public release. These notes document changes from the internal preview to v0.2.0-beta for users upgrading from any pre-beta version.

---

## No Breaking Changes

Turpan v0.2.0-beta has **no breaking changes**. All existing `turpan.yml` configurations remain valid. All CLI commands work as before with improved output.

---

## New Config Options (Optional)

If you already have a `turpan.yml`, you can optionally add these new sections:

### MCP Server Hardening (Phase 28)

```yaml
# Optional — Turpan uses these defaults if not specified:
mcp:
  server:
    auditLog:
      path: .turpan/audit/       # directory for audit logs
      maxSizeMb: 10             # max file size before rotation
      maxFiles: 5               # max rotated files to keep
      dailyRotation: false      # rotate daily (true in CI)
    staleLockTimeoutMs: 300000  # 5 minutes
    staleLockGraceMs: 30000     # 30 seconds
    rateLimit:
      maxCallsPerMinute: 60     # global
      maxReviewCallsPerMinute: 20
      maxUiTestCallsPerMinute: 10
```

### Plugin Process Isolation (Phase 29)

```yaml
# Optional — worker mode is the default:
security:
  plugins:
    sandboxMode: worker  # "worker" (default) or "process"
    processSandbox:
      enabled: true
      timeoutMs: 120000   # 2 minutes
      maxMemoryMb: 256
      maxOutputBytes: 1048576  # 1MB
```

### Authenticated SaaS Testing (Phase 27)

```yaml
# Optional — testUser is DISABLED by default:
testUser:
  enabled: false        # MUST be explicitly set to true
  email: ""               # required if enabled
  loginPath: /login       # your app's login URL
  dashboardPath: /dashboard  # route to verify after login
  seedCommand: ""        # optional: populate test data
  # NEVER: passwordStored is always false
```

---

## New CLI Commands

| Command | Description |
|---------|-------------|
| `turpan mcp status` | Show MCP server status (audit, rate limits, concurrency) |
| `turpan scenarios test-auth` | Show authenticated SaaS test configuration |
| `turpan dependency-audit` | Scan dependencies offline |
| `turpan dependency-audit --online` | Scan with NVD vulnerability database |
| `turpan review-diff` | Diff-scoped review between two refs |

---

## What Changed in Output

### MCP Status Command

The new `turpan mcp status` command shows the MCP server's operational state:

```
🔍 Turpan MCP Status

Workspace:
  Allowlist roots: (none — all paths allowed)
  Project path:    /path/to/project

Concurrency Guard:
  Active run:      (none)
  Stale timeout:  300s
  Grace period:   30s

Rate Limits:
  Global:        0/60 calls/min

Audit Log:
  Path:          (not set)
  Max size:      10MB
  Max files:     5
  Daily rotate:  disabled
```

### Audit Log Format

Every MCP call now produces an audit log entry:

```
[2026-06-22T14:00:00.000Z] INFO  [MCP_CALL] tool=initialize duration=45ms success=true
[2026-06-22T14:01:00.000Z] INFO  [MCP_CALL] tool=review duration=1200ms success=true findings=3
```

---

## Dependency Audit SBOM

The `dependency-audit` command now generates SBOM files:

```
.turpan/runs/dep-audit-2026-06-22/sbom.json      # Custom JSON SBOM
.turpan/runs/dep-audit-2026-06-22/sbom.cdx.json  # CycloneDX 1.4 SBOM
```

---

## Authenticated SaaS: What's Different

If you were using UI tests with authentication:

**Before**: Custom seed script approach  
**After**: First-class `testUser` config + `turpan scenarios test-auth`

The new approach:
- Explicit opt-in (`enabled: true` required)
- DRY-RUN by default — never runs without config
- No credentials persisted to disk
- Works with any login form

---

## If You Were Using Plugins

Plugin manifest format is unchanged. New features:

- **Process sandbox mode**: Add `sandboxMode: process` to `turpan.yml` for stronger isolation
- **New permissions**: 8 permission types in manifest
- **Trust database**: `trust.db` for approved plugin fingerprints

---

## If You Were Using GitHub Actions

The GitHub Actions workflow is unchanged. New environment variables:

```yaml
# Optional MCP hardening:
- name: Run Turpan
  env:
    TURPAN_MCP_STALE_LOCK_TIMEOUT_MS: 300000
    TURPAN_MCP_RATE_LIMIT_MAX: 60
```

---

## If You Hit Issues After Upgrading

### "chalk16.clear is not a function"

**Fixed in v0.2.0-beta**. If you see this, upgrade to the latest version.

### Parallel build fails (TS5055)

Workaround — build core first:
```bash
find packages/core/dist -name "*.d.ts" -delete
pnpm -F @turpan/core build
pnpm build  # rest of packages
```

### CLI commands fail after upgrade

```bash
pnpm install     # reinstall dependencies
pnpm build      # rebuild all packages
turpan doctor   # verify
```

---

## No Action Required

In most cases, **no migration is needed**. Your existing `turpan.yml` and workflows continue to work. v0.2.0-beta is a drop-in replacement with new features added on top.

The only opt-in changes are:
1. MCP hardening (adds audit log automatically if path is configured)
2. Process sandbox mode (add `sandboxMode: process` if needed)
3. Authenticated SaaS testing (add `testUser` config if needed)
4. Dependency audit (run `turpan dependency-audit` — no config needed)
