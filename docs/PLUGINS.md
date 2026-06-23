# Plugins

Turpan's plugin system lets you extend the review pipeline with
project-type-specific analyzers, scenarios, rulesets, and report sections —
without forking the core.

## What is a plugin?

A plugin is a TypeScript module that exports a `Plugin` object. The plugin
declares what it contributes (analyzers, scenarios, rulesets, …) and registers
them with the plugin registry at runtime.

```typescript
import type { Plugin, PluginManifest } from '@turpan/core';

const manifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Custom analyzers for my project type',
};

export const myPlugin: Plugin = {
  manifest,

  supports(fingerprint): boolean {
    // Return true if your plugin applies to this project.
    return fingerprint.appType === 'my-app-type';
  },

  register(registry, ctx): void {
    registry.registerAnalyzer(createMyAnalyzer(), manifest.id);
    registry.registerRuleset({ id: 'my-rules', rules: '...' }, manifest.id);
  },
};
```

## What can a plugin contribute?

| Contribution          | Interface                  | What it does                          |
|-----------------------|----------------------------|---------------------------------------|
| Analyzers             | `PluginAnalyzers`          | Static / dynamic code analysis        |
| Stages                | `PluginStages`             | Custom review pipeline stages         |
| Rulesets              | `PluginRuleset`            | YAML-style rule definitions           |
| Report sections       | `PluginReportSection`      | Custom Markdown/HTML blocks           |
| UI scenarios          | `PluginUIScenario`         | Interactive Playwright flows          |
| Project detectors     | `PluginProjectDetector`    | Customize `appType` detection         |
| Fixers                | `PluginFixer`              | Automated fix implementations         |
| CLI commands          | `PluginCommand`            | Extra top-level CLI commands          |

## Built-in plugins

Six plugins ship with Turpan:

| ID              | Always loaded? | Detects                                              |
|-----------------|----------------|------------------------------------------------------|
| `next`          | When Next.js   | Route detection, hydration, dynamic imports          |
| `vite`          | When Vite      | Dev-server checks, `import.meta.env`, HMR config     |
| `python`        | When Python    | Imports, tests, venv, bare except, print statements  |
| `saas`          | When SaaS-like | Auth, billing, multi-tenancy, GDPR                   |
| `mcp`           | When MCP       | Tool definition validation, timeouts, file access    |
| `security-basic`| No — opt-in    | Secret detection, SQL injection, XSS                 |

## Configuration

In `turpan.yml`:

```yaml
plugins:
  - next
  - saas
  - security-basic
```

Or from the CLI:

```bash
turpan review . --plugins next,saas,security-basic
```

When `plugins` is **empty**, Turpan auto-loads plugins whose `supports()`
returns `true` for the current project's fingerprint.

## Listing plugins

```bash
turpan plugins list                  # what's loaded for this project
turpan plugins list --all            # every built-in plugin
turpan plugins inspect saas          # details on one plugin
```

## Authoring a plugin

### 1. Create the package

```bash
mkdir my-turpan-plugin
cd my-turpan-plugin
pnpm init
pnpm add @turpan/core
```

### 2. Implement the plugin

```typescript
// src/index.ts
import type { Plugin, PluginManifest } from '@turpan/core';

const manifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '0.1.0',
  description: 'Detects leftover console.logs in production code',
};

export const myPlugin: Plugin = {
  manifest,
  supports(fp) {
    return fp.languages.includes('TypeScript') || fp.languages.includes('JavaScript');
  },
  register(registry, ctx) {
    registry.registerAnalyzer({
      id: 'no-console-log',
      name: 'No Console Log',
      categories: ['maintainability'],
      supports: () => true,
      async run(ctx) {
        // walk files, find console.log, return findings
        return { findings: [...] };
      },
    });
  },
};
```

### 3. Reference it

Add to `turpan.yml`:

```yaml
plugins:
  - ./my-turpan-plugin   # path-based plugin
  - my-turpan-plugin     # or via npm name (must be installed)
```

## Discovering plugins

Plugins are discovered from three places, in order:

1. **Built-in plugins** bundled with `@turpan/core`.
2. **Local paths** in `turpan.yml` `plugins:` config (relative to project root).
3. **npm packages** named `@turpan/plugin-<id>` or `<id>` if they have a
   `turpan-plugin` field in their `package.json`.

## Plugin trust levels

Every plugin has one of three trust levels:

| Trust level        | Who sets it               | Execution environment                              |
|--------------------|---------------------------|----------------------------------------------------|
| `builtin`          | @turpan/core (fixed)      | In-process, full Node.js privileges                |
| `local-trusted`    | `turpan plugins trust` CLI | Sandboxed worker thread, restricted API surface   |
| `external-untrusted` | Config or CLI (default)  | Sandboxed worker thread, minimal permissions        |

Built-in plugins (`next`, `vite`, `python`, `saas`, `mcp`, `security-basic`) are
always `builtin` and cannot be changed. External plugins default to
`external-untrusted`.

## Plugin permissions

Plugins declare permissions in their manifest. A plugin can only perform
operations for which it has been granted permission.

| Permission            | What it allows                                         |
|-----------------------|-------------------------------------------------------|
| `read-project-files`  | Read project source files (type-checked extensions)   |
| `read-package-metadata` | Read `package.json` and dependency information       |
| `run-analysis-only`  | Run analyzers and report findings (no file writes)    |
| `propose-fixes`      | Propose fixes for review before application            |
| `ui-scenarios`        | Run UI test scenarios                                 |
| `read-config`         | Read `turpan.yml` and `.turpan` config                |
| `network-fetch`       | Make outbound HTTP requests (online analysis)         |
| `run-commands`        | Run sandboxed CLI commands (`pnpm`, `git`, etc.)      |

Default permissions by trust level:

- **builtin**: all permissions
- **local-trusted**: everything except `network-fetch` and `run-commands`
- **external-untrusted**: `read-package-metadata`, `run-analysis-only` only

Defaults can be overridden in `turpan.yml`.

## Plugin manifest

External plugins must provide a valid manifest:

```typescript
const manifest: PluginManifest = {
  id: 'my-plugin',        // kebab-case, required
  name: 'My Plugin',      // required
  version: '1.0.0',       // semver, required
  description: '...',     // recommended (warning if missing)
  permissions: [          // optional — defaults to trust-level default
    'read-package-metadata',
    'run-analysis-only',
  ],
};
```

Manifests are validated before a plugin is loaded. Missing required fields,
invalid semver, or unknown permissions cause the plugin to be rejected.

## Plugin sandboxing

External plugins (those loaded from `node_modules` or `.turpan/plugins/`)
run inside a sandbox with a restricted API surface.

### Sandbox modes

Two isolation modes are available, configured via `security.plugins.sandboxMode`:

| Mode | Isolation level | Default | Performance |
|------|-----------------|---------|------------|
| `worker` | Worker thread (Phase 22) | ✅ Yes | Fast (~10ms spawn) |
| `process` | Child process with IPC (Phase 29) | No | Slower (~100ms spawn) |

**`worker` mode** (default):
- Runs in a worker thread; shares the Node.js event loop with the parent
- Same V8 heap as parent (memory limits are soft)
- Zero serialization overhead

**`process` mode** (opt-in, Phase 29):
- Runs in a separate OS process with its own V8 heap
- Hard memory limit via `--max-old-space-size` (default 256MB)
- Separate event loop — runaway plugin cannot starve the parent
- OS-level crash isolation (segfault ≠ parent crash)
- JSON-over-stdio IPC protocol
- Explicit env allowlist — no inherited secrets
- SIGKILL timeout enforcement

### Sandbox restrictions

Regardless of mode, sandboxed plugins have:
- No direct access to `fs`, `net`, or `child_process` from the parent context
- Only allowed file paths passed as a scoped allowlist
- All file reads go through a sandboxed context that blocks path traversal
- Command execution restricted to an allowlist (`pnpm`, `npm`, `yarn`, `git`, etc.)
- Output sanitized (secrets redacted, long output truncated)
- Timeout enforced per plugin (default 30s)

Sandboxing is enabled by default for external plugins. It can be disabled
with `security.plugins.sandboxExternal: false` (not recommended for
untrusted plugins).

Use `sandboxMode: process` when running untrusted 3rd-party plugins
where OS-level process boundaries provide stronger isolation.

## CLI commands

```bash
# List loaded plugins
turpan plugins list

# Inspect a specific plugin
turpan plugins inspect <plugin-id>

# Trust an external plugin (grants local-trusted level)
turpan plugins trust my-plugin

# Trust with specific permissions
turpan plugins trust my-plugin --level local-trusted --permissions read-project-files run-analysis-only

# Revoke trust
turpan plugins trust my-plugin --revoke

# Show available permissions
turpan plugins permissions
turpan plugins permissions --json
```

## Plugin safety

Built-in plugins run in the same Node.js process as Turpan with full
privileges. External plugins are isolated:

Mitigations:

- External plugins are **disabled by default** (`allowExternal: false`).
- Plugins are **explicitly listed** in `turpan.yml` or `--plugins`.
- The plugin's `manifest` is **validated** before loading.
- Plugin operations are **permission-gated** — if a plugin requests a
  permission not granted, it is blocked.
- External plugins run in **sandboxed worker threads** with no direct
  filesystem or network access from the parent context.
- All plugin operations **time out** after `maxPluginRuntimeMs` (default 30s).
- **Path traversal is blocked** — `../etc/passwd` reads are rejected.
- **Dangerous commands** (`rm -rf /`, `sudo`, pipe-to-shell) are blocked.
- The plugin's **output is sanitized** — secrets redacted, findings validated.

## What's next

- See the [built-in plugins](../packages/core/src/plugins/builtin/) for
  real-world examples.
- See the [example fixtures](../examples/fixtures/) for full projects that
  exercise specific plugins.
