# Phase 13: Plugin System

## Summary

Implemented a comprehensive **Turpan Plugin System** that makes Turpan fully extensible. Different project types can now leverage specialized review skills without bloating the core with hardcoded analyzers.

## Architecture

### Plugin API (`packages/core/src/plugins/`)

| File | Purpose |
|------|---------|
| `Plugin.ts` | Plugin interface, manifest, and contribution types |
| `PluginContext.ts` | Context passed to plugins during registration |
| `PluginRegistry.ts` | Central registry tracking all plugin contributions |
| `PluginLoader.ts` | Discovery and loading from config + auto-detection |

### Plugin Contribution Types

A plugin can contribute:

| Contribution | Interface | Description |
|-------------|-----------|-------------|
| **Analyzers** | `PluginAnalyzers` | Standalone code analyzers |
| **Stages** | `PluginStages` | Custom review pipeline stages |
| **Rulesets** | `PluginRuleset` | YAML rule definitions |
| **Report Sections** | `PluginReportSection` | Custom report renderings |
| **UI Scenarios** | `PluginUIScenario` | Interaction test templates |
| **Detectors** | `PluginProjectDetector` | Project type detection |
| **Fixers** | `PluginFixer` | Automated fix implementations |
| **Commands** | `PluginCommand` | CLI command extensions |

### Plugin Interface

```typescript
interface Plugin {
  manifest: PluginManifest;          // id, name, version, description
  supports(fingerprint): boolean;   // Whether plugin applies to project
  register(registry, ctx): void;   // Register contributions
}
```

## Built-in Plugins

### 1. Next.js Plugin (`next`)
- **Route detection** (app/pages router)
- **Hydration checks** (Suspense boundaries)
- **Dynamic import analysis**
- **Metadata export checks**

### 2. Vite Plugin (`vite`)
- **Dev server detection**
- **Import meta.env validation** (vs process.env)
- **HMR configuration checks**
- **OptimizeDeps config checks**

### 3. Python Plugin (`python`)
- **Syntax/import analysis**
- **Test discovery** (pytest)
- **Virtual environment checks**
- **Bare except detection**
- **Print statement warnings**

### 4. SaaS Plugin (`saas`)
- **Route expectations** (/pricing, /login, /dashboard, etc.)
- **Auth flow analysis**
- **Multi-tenancy checks**
- **UI scenarios** (onboarding, pricing CTA, settings flow)
- **SaaS ruleset** (billing, GDPR, tenant isolation)

### 5. MCP Server Plugin (`mcp`)
- **Tool definition validation**
- **Timeout/cancellation checks**
- **File access safety checks**
- **Request logging validation**
- **MCP security ruleset**

### 6. Security Basic Plugin (`security-basic`)
- **Secret detection** (API keys, tokens, passwords)
- **SQL injection patterns**
- **XSS patterns** (innerHTML, dangerouslySetInnerHTML)
- **Shared security rules**

## Configuration

### turpan.yml

```yaml
plugins:
  - next
  - vite
  - python
  - saas
  - security-basic
```

### CLI Usage

```bash
# List all plugins
turpan plugins list

# Inspect a specific plugin
turpan plugins inspect saas

# Run review with specific plugins
turpan review . --plugins saas,security

# Run review with auto-detection
turpan review .
```

## Rulesets (`packages/core/src/rulesets/`)

| File | Purpose |
|------|---------|
| `default.yml` | Base rules for all projects |
| `frontend.yml` | React, Vue, accessibility rules |
| `backend.yml` | Auth, SQL, Node.js best practices |
| `saas.yml` | SaaS-specific rules (billing, multi-tenancy) |
| `mcp-security.yml` | MCP server security rules |
| `agent-output.yml` | AI agent output quality rules |

## Interactive Shell Integration

The shell now supports plugin-based review commands:

```
turpan > use SaaS review skills
turpan > review this as a Python bot
turpan > review this as an MCP server
turpan > review with Next plugin
```

### Intent Router Plugin Detection

```typescript
const PLUGIN_KEYWORDS = {
  'saas': 'saas',
  'python': 'python',
  'mcp': 'mcp',
  'next': 'next',
  'vite': 'vite',
  'security': 'security-basic',
};
```

## Orchestrator Integration

Plugins are loaded in `ReviewOrchestrator.ts`:

```typescript
const pluginRegistry = new PluginRegistry();
const pluginResult = await loadPlugins(pluginRegistry, {
  projectRoot: projectPath,
  fingerprint,
  enabledPlugins: config.plugins,
  config: config as Record<string, unknown>,
});
loadedPluginIds = pluginResult.loaded;
ctx.enabledPlugins = loadedPluginIds;
```

## Tests Added

- Plugin registration/unregistration
- Analyzer registration from plugins
- Ruleset registration
- Report section ordering
- UI scenario categorization
- Detector priority ordering
- Fixer retrieval by category
- Command registration
- `isPlugin` type guard
- Builtin plugin support detection
- PluginContext creation
- Config-based plugin loading
- Auto-detection behavior

## API Surface

```typescript
// Core exports
export { PluginRegistry } from './PluginRegistry.js';
export { loadPlugins } from './PluginLoader.js';
export { buildPluginContext } from './PluginContext.js';

// Types
export type { Plugin, PluginManifest } from './Plugin.js';
export type { PluginContext, PluginRuntimeContext } from './PluginContext.js';
export type { PluginLoadOptions, PluginLoadResult } from './PluginLoader.js';
export type { 
  PluginAnalyzers,
  PluginStages,
  PluginRuleset,
  PluginReportSection,
  PluginUIScenario,
  PluginProjectDetector,
  PluginFixer,
  PluginCommand,
} from './Plugin.js';

// Builtin plugins
export { nextPlugin } from './builtin/next/index.js';
export { vitePlugin } from './builtin/vite/index.js';
export { pythonPlugin } from './builtin/python/index.js';
export { saasPlugin } from './builtin/saas/index.js';
export { mcpPlugin } from './builtin/mcp/index.js';
export { securityBasicPlugin } from './builtin/security-basic/index.js';
```

## Future Plugin Ideas

Based on the original requirements, these plugins can be added:

- `turpan-plugin-fastapi` - FastAPI-specific checks (Pydantic, async routes)
- `turpan-plugin-telegram-bot` - Telegram bot patterns
- `turpan-plugin-chrome-extension` - Manifest.json validation
- `turpan-plugin-ui-premium-review` - Visual regression + accessibility

## Files Changed

### Created
- `packages/core/src/plugins/PluginContext.ts`
- `packages/core/src/rulesets/index.ts`
- `PHASE_13_PLUGIN_SYSTEM_REPORT.md`

### Modified
- `packages/core/src/plugins/Plugin.ts` - Extract PluginContext
- `packages/core/src/plugins/PluginLoader.ts` - Import from PluginContext
- `packages/core/src/plugins/index.ts` - Export PluginContext
- `packages/core/src/plugins/plugins.test.ts` - Fix tests + add new tests
- `packages/core/src/plugins/builtin/*/Plugin.ts` - Update imports
- `packages/core/src/orchestrator/ReviewOrchestrator.ts` - Add plugins support
- `packages/core/src/orchestrator/ReviewContext.ts` - Add enabledPlugins
- `apps/cli/src/commands/review.ts` - Add `--plugins` flag
- `apps/cli/src/shell/IntentRouter.ts` - Add plugin_review handling
- `apps/cli/src/shell/InteractiveShell.ts` - Pass plugins to runReview

## Verification

```bash
cd packages/core
pnpm test -- plugins.test.ts
```

All 40+ tests pass, covering:
- Registry operations
- Plugin interface
- Builtin plugin support detection
- Context creation
- Config integration
- Auto-detection
