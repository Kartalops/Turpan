# Configuration (`turpan.yml`)

`turpan.yml` is the single source of truth for how Turpan reviews your project.
Place it in your project root. Run `turpan init` to generate a starter.

## Full schema

```yaml
# ── Top-level ────────────────────────────────────────────────────────────────
version: 0.1.0                # Config schema version
projectPath: /abs/path       # Absolute path (auto-filled by Turpan)
runPath: .turpan/runs        # Where to write per-run artifacts
deepAnalysis: false          # Default for `turpan review` without --deep
uiAnalysis: false            # Default for `turpan review` without --ui
fixMode: false               # Default for `turpan review` without --fix
logLevel: info               # debug | info | warn | error

# ── Project metadata ────────────────────────────────────────────────────────
project:
  name: my-app               # Display name (default: directory name)

# ── Command overrides ───────────────────────────────────────────────────────
# If empty, Turpan reads scripts from package.json / pyproject.toml.
# If non-empty, Turpan uses these commands verbatim.
commands:
  install: pnpm install
  build:   pnpm build
  test:    pnpm test
  lint:    pnpm lint
  typecheck: pnpm exec tsc --noEmit
  dev:     pnpm dev

# ── UI testing ──────────────────────────────────────────────────────────────
ui:
  enabled: true              # Run UI tests automatically
  baseUrl: ""                # If set, skip dev server and use this URL
  scenarios:                 # Specific scenarios to run (empty = all)
    - auth
    - billing
    - dashboard
  viewports: [desktop, mobile]

# ── Fix engine ──────────────────────────────────────────────────────────────
fix:
  mode: report-only          # report-only | patch-only | auto-safe | apply
  maxFilesChanged: 5         # Hard cap on files per fix
  allowDependencyChanges: false
  allowFileDeletion: false

# ── Security ────────────────────────────────────────────────────────────────
security:
  redactSecrets: true        # Redact secrets in logs and reports
  plugins:
    allowExternal: false     # Allow external plugins from node_modules (default: false)
    sandboxExternal: true     # Run external plugins in sandbox (default: true)
    sandboxMode: worker      # worker | process — process provides OS-level isolation
    processSandbox:
      enabled: false         # Enable process sandbox (default: false)
      memoryLimitMb: 256     # Hard memory cap for child process (default: 256)
      timeoutMs: 30000       # Per-plugin timeout in ms (default: 30000)
      allowNetwork: false    # Allow outbound network in process mode
      allowCommands: false   # Allow command execution in process mode
    maxPluginRuntimeMs: 30000
    memoryCapMb: 256
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

# ── Dependency Audit ─────────────────────────────────────────────────────────
dependencyAudit:
  enabled: false             # Enable dependency audit (opt-in)
  online: false              # Enable live CVE scanning (OSV/npm audit) — requires --dependency-audit
  failOnCritical: true       # Exit 1 on critical vulnerabilities
  licensePolicy:
    disallowed:              # Licenses that always fail the audit
      - GPL-3.0
      - AGPL-3.0
    warnUnknown: true        # Warn on unrecognized licenses

# ── Plugins ─────────────────────────────────────────────────────────────────
# Empty list = auto-detect from project fingerprint
plugins:
  - next
  - saas
  - security-basic

# ── Ignore paths ───────────────────────────────────────────────────────────
# Files/dirs to skip during analysis (in addition to built-in defaults).
ignore:
  paths:
    - vendor
    - legacy-code
  globs:
    - "*.bak"
    - "**/*.generated.ts"
```

## Field reference

### Top-level

| Field           | Type    | Default       | Notes                                  |
|-----------------|---------|---------------|----------------------------------------|
| `version`       | string  | `0.1.0`       | Schema version                         |
| `projectPath`   | string  | (cwd)         | Absolute path to project root          |
| `runPath`       | string  | `.turpan/runs`| Where to write run artifacts           |
| `deepAnalysis`  | boolean | `false`       | Default if `--deep` not passed         |
| `uiAnalysis`    | boolean | `false`       | Default if `--ui` not passed           |
| `fixMode`       | boolean | `false`       | Default if `--fix` not passed          |
| `logLevel`      | string  | `info`        | `debug` / `info` / `warn` / `error`    |

### `project`

| Field   | Type   | Default                  | Notes                          |
|---------|--------|--------------------------|--------------------------------|
| `name`  | string | (directory basename)     | Display name in reports        |

### `commands`

Empty string `""` means "auto-detect from package.json". Non-empty overrides
the detected script. Commands are parsed by Turpan's SafeCommandRunner — they
cannot contain shell operators.

| Field       | Auto-detected from                     |
|-------------|----------------------------------------|
| `install`   | Lockfile (pnpm → `pnpm install`, etc.) |
| `build`     | `scripts.build` in `package.json`     |
| `test`      | `scripts.test`                         |
| `lint`      | `scripts.lint`                         |
| `typecheck` | `scripts.typecheck` or `scripts.check` |
| `dev`       | `scripts.dev`                          |

### `ui`

| Field        | Type             | Default | Notes                            |
|--------------|------------------|---------|----------------------------------|
| `enabled`    | boolean          | `false` | Run UI tests by default          |
| `baseUrl`    | string           | `""`    | Skip dev server start if set      |
| `scenarios`  | string[]         | `[]`    | Empty = run all supported        |
| `viewports`  | `Array<'desktop' \| 'mobile'>` | `[desktop, mobile]` | Viewports to test |
| `testUser`   | object           | (see below) | Phase 27 authenticated SaaS config — DRY-RUN by default |
| `billing`    | object           | (see below) | Phase 27 billing test-mode config — DISABLED by default |

### `ui.testUser` (Phase 27 — Authenticated SaaS Scenarios)

| Field            | Type    | Default                          | Notes                                                                                       |
|------------------|---------|----------------------------------|---------------------------------------------------------------------------------------------|
| `enabled`        | boolean | `false`                          | Opt-in flag. When `false`, login forms are inspected but NOT submitted.                     |
| `email`          | string  | `turpan-test@example.com`        | Test user email. NOT a secret — safe to log.                                                |
| `password`       | string  | `TurpanTest123!`                 | Test user password. NEVER persisted to disk. Use an isolated test account only.              |
| `seedCommand`    | string  | `""`                             | Optional command to seed the test user. Run through `SafeCommandRunner` with redaction.    |
| `loginPath`      | string  | `/login`                         | Path to login page.                                                                          |
| `dashboardPath`  | string  | `/dashboard`                     | Expected redirect path after login.                                                          |

Safety properties:
- Password is **never** persisted to `auth-state.json` (only `passwordStored: false` is written)
- `seedCommand` output is **redacted** before storage; only exit code, duration, blocked reason are kept
- Form submission only happens when `enabled: true` — otherwise forms are filled with safe data but not submitted

### `ui.billing` (Phase 27 — Billing Test Mode)

| Field              | Type    | Default  | Notes                                                                                       |
|--------------------|---------|----------|---------------------------------------------------------------------------------------------|
| `testMode`         | boolean | `false`  | Opt-in flag. When `false`, billing flows are inspected but no checkout is triggered.        |
| `checkoutEndpoint` | string  | `""`     | Local checkout endpoint (e.g., `/api/test-checkout`). Auto-detected from routes if empty.  |

Safety properties:
- External payment processors (`stripe.com`, `paypal.com`, `braintree.com`, `squareup.com`, `checkout.stripe.com`) are **hard-blocked** even when test mode is enabled
- Only LOCAL endpoints are callable
- Fake success responses (e.g., `sub_fake_*` IDs) trigger a high-severity finding

### `fix`

| Field                    | Type    | Default        | Notes                                |
|--------------------------|---------|----------------|--------------------------------------|
| `mode`                   | string  | `report-only`  | One of 4 modes — see Fix Engine docs |
| `maxFilesChanged`        | number  | `5`            | Hard cap per fix                      |
| `allowDependencyChanges` | boolean | `false`        | Include dep updates                  |
| `allowFileDeletion`      | boolean | `false`        | Include file deletes                 |

### `security`

| Field                    | Type     | Default | Notes                                           |
|--------------------------|----------|---------|------------------------------------------------|
| `redactSecrets`          | boolean  | `true`  | Replace secrets in logs/output                 |
| `plugins.allowExternal`  | boolean  | `false` | Allow loading external plugins from node_modules |
| `plugins.sandboxExternal`| boolean | `true`  | Run external plugins in sandboxed worker threads |
| `plugins.maxPluginRuntimeMs` | number | `30000` | Per-plugin timeout in milliseconds            |
| `plugins.memoryCapMb`    | number   | `256`   | Soft memory cap per sandboxed plugin (MB)      |
| `plugins.localTrustedPermissions` | string[] | (see below) | Default permissions for `local-trusted` plugins |
| `plugins.externalUntrustedPermissions` | string[] | (see below) | Default permissions for `external-untrusted` plugins |
| `plugins.pluginTrust`    | object   | `{}`    | Per-plugin trust/permission overrides          |

Default `localTrustedPermissions`: `read-project-files`, `read-package-metadata`,
`run-analysis-only`, `propose-fixes`, `ui-scenarios`, `read-config`.

Default `externalUntrustedPermissions`: `read-package-metadata`, `run-analysis-only`.

Example — enable external plugins with sandboxing:

```yaml
security:
  plugins:
    allowExternal: true
    sandboxExternal: true
    maxPluginRuntimeMs: 30000
    pluginTrust:
      my-plugin:
        level: local-trusted
        permissions:
          - read-project-files
          - read-package-metadata
          - run-analysis-only
          - propose-fixes
```

### `dependencyAudit`

| Field              | Type     | Default | Notes                                           |
|--------------------|----------|---------|------------------------------------------------|
| `enabled`          | boolean  | `false` | Enable dependency CVE scan + license audit     |
| `online`           | boolean  | `false` | Live CVE data (OSV API + npm audit)           |
| `failOnCritical`   | boolean  | `true`  | Exit 1 on critical vulnerabilities             |
| `licensePolicy.disallowed` | string[] | `[]` | License IDs that always fail the audit      |
| `licensePolicy.warnUnknown` | boolean | `true` | Warn on unrecognized licenses              |

### `plugins`

Array of plugin IDs. If empty, plugins are auto-detected from the project
fingerprint.

Built-in IDs: `next`, `vite`, `python`, `saas`, `mcp`, `security-basic`.

### `ignore`

| Field   | Type     | Notes                                       |
|---------|----------|---------------------------------------------|
| `paths` | string[] | Exact directory paths to skip (relative)    |
| `globs` | string[] | Glob patterns: `*`, `**`, `?` supported    |

Combined with built-in defaults:
- `node_modules`, `.git`, `.next`, `.nuxt`, `.turpan`, `.vite`, `.cache`,
  `.parcel-cache`, `.turbo`, `.swc`, `dist`, `build`, `out`, `coverage`,
  `__tests__`, `__snapshots__`, `__mocks__`, `.idea`, `.vscode`

## Examples

### Next.js SaaS

```yaml
project:
  name: my-saas

commands:
  build: pnpm build
  test: pnpm test
  lint: pnpm lint
  typecheck: pnpm exec tsc --noEmit
  dev: pnpm dev

ui:
  enabled: true
  scenarios: [saas-marketing, auth, billing, dashboard]
  viewports: [desktop, mobile]

fix:
  mode: patch-only
  allowDependencyChanges: false
  allowFileDeletion: false

plugins:
  - next
  - saas
  - security-basic
```

### Python Telegram bot

```yaml
project:
  name: my-bot

commands:
  install: poetry install
  test: pytest
  lint: ruff check .
  typecheck: mypy .

plugins:
  - python
  - security-basic

ignore:
  paths:
    - venv
    - .pytest_cache
```

### FastAPI service

```yaml
project:
  name: my-api

commands:
  install: pip install -r requirements.txt
  test: pytest
  lint: ruff check .
  typecheck: mypy .

plugins:
  - python
  - security-basic
```

## Validation

If `turpan.yml` is malformed, Turpan falls back to defaults and writes a
warning to `logs/turpan.log`. Run `turpan inspect .` to see the effective
configuration that was used.

## See also

- **[CLI Usage](./CLI_USAGE.md)** — every command and flag.
- **[Fix Engine](./FIX_ENGINE.md)** — fix modes and safety.
- **[Plugins](./PLUGINS.md)** — authoring your own plugin.
