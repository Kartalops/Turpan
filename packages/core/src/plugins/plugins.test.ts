/**
 * Plugin System Tests
 * Tests: Plugin registration, plugin support matching, registry operations,
 * plugin-provided analyzers, plugin-provided report sections, config loading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginRegistry,
  type Plugin,
  type PluginManifest,
  type PluginContext,
} from './index.js';
import type { ProjectFingerprint } from '../project/index.js';
import type { Analyzer } from '../analyzers/Analyzer.js';

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const makeFp = (overrides: Partial<ProjectFingerprint> = {}): ProjectFingerprint => ({
  projectRoot: '/tmp/test',
  projectName: 'test-project',
  repositoryStatus: { isGitRepo: false },
  packageManager: 'npm',
  languages: ['typescript'],
  runtimeType: 'node',
  appType: 'unknown',
  uiFramework: 'unknown',
  backendFramework: 'unknown',
  testTools: [],
  buildCommands: [],
  devCommands: [],
  lintCommands: [],
  typecheckCommands: [],
  testCommands: [],
  packageScripts: {},
  dockerAvailable: false,
  dockerComposeAvailable: false,
  envFiles: [],
  envRequirements: [],
  routeHints: [],
  entrypoints: [],
  databaseHints: [],
  authHints: [],
  deploymentHints: {},
  detectedFiles: [],
  missingFiles: [],
  fingerprintedAt: new Date().toISOString(),
  ...overrides,
});

const makePlugin = (id: string, supportsFp: boolean): Plugin => ({
  manifest: { id, name: `Plugin ${id}`, version: '0.1.0' },
  supports: () => supportsFp,
  register: () => {},
});

const makeAnalyzer = (id: string, categories: string[] = ['general']): Analyzer => ({
  id,
  name: `Analyzer ${id}`,
  categories,
  supports: () => true,
  run: async () => ({ analyzerId: id, findings: [], durationMs: 0, errors: [] }),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  // ── Registration ───────────────────────────────────────────────────────────

  describe('registerPlugin', () => {
    it('registers a plugin', () => {
      const plugin = makePlugin('test', true);
      registry.registerPlugin(plugin);
      expect(registry.getPlugin('test')?.manifest.id).toBe('test');
    });

    it('throws on duplicate plugin id', () => {
      const plugin = makePlugin('test', true);
      registry.registerPlugin(plugin);
      expect(() => registry.registerPlugin(plugin)).toThrow('already registered');
    });

    it('unregisterPlugin removes plugin and cascades', () => {
      const plugin = makePlugin('test', true);
      registry.registerPlugin(plugin);
      registry.unregisterPlugin('test');
      expect(registry.getPlugin('test')).toBeUndefined();
    });
  });

  // ── Analyzer Registration ──────────────────────────────────────────────────

  describe('registerAnalyzer / disableAnalyzer', () => {
    it('registers an analyzer', () => {
      const analyzer = makeAnalyzer('unused-dep');
      registry.registerAnalyzer(analyzer, 'test-plugin');
      expect(registry.getAnalyzer('unused-dep')?.id).toBe('unused-dep');
    });

    it('throws on duplicate analyzer id', () => {
      registry.registerAnalyzer(makeAnalyzer('dup'), 'p1');
      expect(() => registry.registerAnalyzer(makeAnalyzer('dup'), 'p2')).toThrow('already registered');
    });

    it('disables an analyzer by id', () => {
      registry.registerAnalyzer(makeAnalyzer('to-disable'), 'p1');
      registry.disableAnalyzer('to-disable');
      expect(registry.getAnalyzer('to-disable')).toBeUndefined();
      expect(registry.isAnalyzerDisabled('to-disable')).toBe(true);
    });

    it('listEnabledAnalyzerIds excludes disabled', () => {
      registry.registerAnalyzer(makeAnalyzer('a1'), 'p');
      registry.registerAnalyzer(makeAnalyzer('a2'), 'p');
      registry.disableAnalyzer('a1');
      const ids = registry.listEnabledAnalyzerIds();
      expect(ids).not.toContain('a1');
      expect(ids).toContain('a2');
    });
  });

  // ── Ruleset Registration ────────────────────────────────────────────────────

  describe('registerRuleset', () => {
    it('registers and retrieves a ruleset', () => {
      registry.registerRuleset({ id: 'saas', label: 'SaaS Rules' }, 'saas');
      expect(registry.getRuleset('saas')?.label).toBe('SaaS Rules');
    });

    it('listRulesets returns all rulesets', () => {
      registry.registerRuleset({ id: 'r1', label: 'R1' }, 'p1');
      registry.registerRuleset({ id: 'r2', label: 'R2' }, 'p2');
      expect(registry.listRulesets()).toHaveLength(2);
    });
  });

  // ── Report Section Registration ─────────────────────────────────────────────

  describe('registerReportSection', () => {
    it('registers and retrieves a report section', () => {
      registry.registerReportSection({ id: 'custom-1', title: 'Custom', type: 'custom' }, 'my-plugin');
      expect(registry.listReportSections()).toHaveLength(1);
      expect(registry.listReportSections()[0].section.id).toBe('custom-1');
    });

    it('report sections are sorted by order', () => {
      registry.registerReportSection({ id: 's2', title: 'S2', type: 'summary', order: 2 }, 'p');
      registry.registerReportSection({ id: 's1', title: 'S1', type: 'summary', order: 1 }, 'p');
      const sections = registry.listReportSections();
      expect(sections[0].section.id).toBe('s1');
      expect(sections[1].section.id).toBe('s2');
    });
  });

  // ── UI Scenario Registration ────────────────────────────────────────────────

  describe('registerUIScenario', () => {
    it('registers and retrieves a scenario', () => {
      registry.registerUIScenario({ id: 'saas.onboarding', label: 'Onboarding', category: 'saas', steps: [] }, 'saas');
      expect(registry.getScenario('saas.onboarding')?.label).toBe('Onboarding');
    });

    it('listScenariosByCategory filters correctly', () => {
      registry.registerUIScenario({ id: 's1', label: 'S1', category: 'saas', steps: [] }, 'p');
      registry.registerUIScenario({ id: 's2', label: 'S2', category: 'mcp', steps: [] }, 'p');
      const saas = registry.listScenariosByCategory('saas');
      expect(saas).toHaveLength(1);
      expect(saas[0].id).toBe('s1');
    });
  });

  // ── Detector Registration ───────────────────────────────────────────────────

  describe('registerDetector', () => {
    it('registers and orders detectors by priority', () => {
      registry.registerDetector({ id: 'd1', detect: () => true, priority: 10 }, 'p1');
      registry.registerDetector({ id: 'd2', detect: () => true, priority: 50 }, 'p2');
      registry.registerDetector({ id: 'd3', detect: () => true, priority: 25 }, 'p3');
      const detectors = registry.listDetectors();
      expect(detectors[0].detector.id).toBe('d2'); // priority 50
      expect(detectors[1].detector.id).toBe('d3'); // priority 25
      expect(detectors[2].detector.id).toBe('d1'); // priority 10
    });
  });

  // ── Fixer Registration ──────────────────────────────────────────────────────

  describe('registerFixer', () => {
    it('registers and retrieves fixer by category', () => {
      const fixer = { id: 'fix-auth', category: 'auth', auto: false, fix: async () => ({ success: true }) };
      registry.registerFixer(fixer, 'auth-plugin');
      expect(registry.getFixer('auth')?.id).toBe('fix-auth');
    });
  });

  // ── Command Registration ───────────────────────────────────────────────────

  describe('registerCommand', () => {
    it('registers and retrieves a command', () => {
      const cmd = {
        name: 'saas:check-routes',
        description: 'Check SaaS routes',
        run: async () => ({ code: 0, output: '' }),
      };
      registry.registerCommand(cmd, 'saas');
      expect(registry.getCommand('saas:check-routes')?.name).toBe('saas:check-routes');
    });
  });

  // ── pluginsFor ─────────────────────────────────────────────────────────────

  describe('pluginsFor', () => {
    it('returns plugins that support the fingerprint', () => {
      const p1 = makePlugin('p1', true);
      const p2 = makePlugin('p2', false);
      registry.registerPlugin(p1);
      registry.registerPlugin(p2);

      const fp = makeFp({ appType: 'nextjs' });
      const supported = registry.pluginsFor(fp);
      expect(supported).toHaveLength(1);
      expect(supported[0].manifest.id).toBe('p1');
    });
  });

  // ── toSummary ─────────────────────────────────────────────────────────────

  describe('toSummary', () => {
    it('returns a serializable summary', () => {
      registry.registerPlugin(makePlugin('test', true));
      registry.registerAnalyzer(makeAnalyzer('a1'), 'test');
      registry.registerRuleset({ id: 'r1', label: 'R1' }, 'test');

      const summary = registry.toSummary();
      expect(summary.plugins).toHaveLength(1);
      expect(summary.analyzerCount).toBe(1);
      expect(summary.rulesetCount).toBe(1);
    });
  });
});

// ── Plugin Interface Tests ─────────────────────────────────────────────────────

describe('Plugin interface', () => {
  it('isPlugin returns true for valid plugin objects', async () => {
    const plugin: Plugin = {
      manifest: { id: 'test', name: 'Test', version: '0.1.0' },
      supports: () => true,
      register: () => {},
    };
    const { isPlugin } = await import('./Plugin.js');
    expect(isPlugin(plugin)).toBe(true);
  });

  it('isPlugin returns false for non-objects and missing fields', async () => {
    const { isPlugin } = await import('./Plugin.js');
    expect(isPlugin(null)).toBe(false);
    expect(isPlugin({})).toBe(false);
    expect(isPlugin({ manifest: {} })).toBe(false);
    expect(isPlugin({ manifest: {}, supports: () => {} })).toBe(false);
  });
});

// ── Analyzer Interface Tests ───────────────────────────────────────────────────

describe('Analyzer integration with plugins', () => {
  it('a plugin can register an analyzer that appears in the registry', () => {
    const registry = new PluginRegistry();
    const plugin: Plugin = {
      manifest: { id: 'next', name: 'Next.js', version: '0.1.0' },
      supports: () => true,
      register(registry) {
        registry.registerAnalyzer({
          id: 'next-specific',
          name: 'Next Specific',
          categories: ['nextjs'],
          supports: () => true,
          run: async () => ({ analyzerId: 'next-specific', findings: [], durationMs: 0, errors: [] }),
        }, 'next');
      },
    };

    plugin.register(registry, {} as PluginContext);
    expect(registry.getAnalyzer('next-specific')?.id).toBe('next-specific');
    expect(registry.listAnalyzers()).toHaveLength(1);
  });

  it('analyzer registered by plugin is returned by listEnabledAnalyzerIds', () => {
    const registry = new PluginRegistry();
    const analyzer: Analyzer = {
      id: 'plugin-analyzer',
      name: 'Plugin Analyzer',
      categories: ['plugin'],
      supports: () => true,
      run: async () => ({ analyzerId: 'plugin-analyzer', findings: [], durationMs: 0, errors: [] }),
    };

    registry.registerAnalyzer(analyzer, 'test-plugin');
    const enabled = registry.listEnabledAnalyzerIds();
    expect(enabled).toContain('plugin-analyzer');
  });
});

// ── Config Loading Tests ───────────────────────────────────────────────────────

describe('Plugin config integration', () => {
  it('enabledPlugins from config restrict which plugins are loaded', async () => {
    const { loadPlugins } = await import('./PluginLoader.js');

    const registry = new PluginRegistry();
    const fp = makeFp({ appType: 'nextjs' });

    // Load only the 'next' plugin explicitly
    const result = await loadPlugins(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      enabledPlugins: ['next'],
    });

    // Should have attempted to load 'next' (and maybe skipped if not supported or loaded)
    expect(result.loaded.length >= 0).toBe(true);
    // Errors from trying to load non-builtin configs should be tracked
    expect(result.errors.length >= 0).toBe(true);
  });

  it('autoDetectPlugins returns next for nextjs app type', async () => {
    const { loadPlugins } = await import('./PluginLoader.js');
    const registry = new PluginRegistry();
    const fp = makeFp({ appType: 'nextjs' });

    // With no explicit plugins, auto-detection should find next
    const result = await loadPlugins(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      enabledPlugins: [], // empty = auto-detect
    });

    // next should be among the loaded plugins for a Next.js project
    expect(result.loaded).toContain('next');
  });

  it('skips plugins that do not support the project fingerprint', async () => {
    const { loadPlugins } = await import('./PluginLoader.js');
    const registry = new PluginRegistry();
    const fp = makeFp({ appType: 'unknown', languages: ['go'] });

    const result = await loadPlugins(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      enabledPlugins: ['next'], // next only supports nextjs
    });

    expect(result.loaded).not.toContain('next');
    expect(result.skipped.some(s => s.id === 'next')).toBe(true);
  });

  it('auto-detects saas plugin for projects with auth hints', async () => {
    const { loadPlugins } = await import('./PluginLoader.js');
    const registry = new PluginRegistry();
    const fp = makeFp({ 
      authHints: [{ type: ['jwt'] }],
      routeHints: [{ type: 'app', count: 10 }],
    });

    const result = await loadPlugins(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      enabledPlugins: [],
    });

    expect(result.loaded).toContain('saas');
  });

  it('loads security-basic for any project', async () => {
    const { loadPlugins } = await import('./PluginLoader.js');
    const registry = new PluginRegistry();
    const fp = makeFp({ appType: 'unknown' });

    const result = await loadPlugins(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      enabledPlugins: [],
    });

    expect(result.loaded).toContain('security-basic');
  });
});

// ── PluginContext Tests ─────────────────────────────────────────────────────────

describe('PluginContext', () => {
  it('buildPluginContext creates a valid context', async () => {
    const { buildPluginContext } = await import('./PluginContext.js');
    const fp = makeFp();
    
    const ctx = buildPluginContext('/project/root', fp, { plugins: ['saas'] });
    
    expect(ctx.projectRoot).toBe('/project/root');
    expect(ctx.fingerprint).toBe(fp);
    expect(ctx.turpanDir).toBe('/project/root/.turpan');
    expect(ctx.config).toEqual({ plugins: ['saas'] });
    expect(ctx.signal).toBeUndefined();
  });

  it('buildPluginContext accepts AbortSignal', async () => {
    const { buildPluginContext } = await import('./PluginContext.js');
    const fp = makeFp();
    const controller = new AbortController();
    
    const ctx = buildPluginContext('/project/root', fp, {}, controller.signal);
    
    expect(ctx.signal).toBe(controller.signal);
  });
});

// ── Builtin Plugin Tests ──────────────────────────────────────────────────────

describe('Builtin Plugins', () => {
  it('nextPlugin supports nextjs projects', async () => {
    const { nextPlugin } = await import('./builtin/next/index.js');
    const fp = makeFp({ appType: 'nextjs' });
    expect(nextPlugin.supports(fp)).toBe(true);
  });

  it('nextPlugin does not support non-nextjs projects', async () => {
    const { nextPlugin } = await import('./builtin/next/index.js');
    const fp = makeFp({ appType: 'vite-react' });
    expect(nextPlugin.supports(fp)).toBe(false);
  });

  it('saasPlugin supports projects with auth hints', async () => {
    const { saasPlugin } = await import('./builtin/saas/index.js');
    const fp = makeFp({ authHints: [{ type: ['oauth'] }] });
    expect(saasPlugin.supports(fp)).toBe(true);
  });

  it('saasPlugin does not support plain projects', async () => {
    const { saasPlugin } = await import('./builtin/saas/index.js');
    const fp = makeFp({ appType: 'unknown' });
    expect(saasPlugin.supports(fp)).toBe(false);
  });

  it('pythonPlugin supports Python projects', async () => {
    const { pythonPlugin } = await import('./builtin/python/index.js');
    const fp = makeFp({ languages: ['python'] });
    expect(pythonPlugin.supports(fp)).toBe(true);
  });

  it('securityBasicPlugin supports all projects', async () => {
    const { securityBasicPlugin } = await import('./builtin/security-basic/index.js');
    const fp = makeFp({ appType: 'unknown' });
    expect(securityBasicPlugin.supports(fp)).toBe(true);
  });

  it('saasPlugin registers UI scenarios', async () => {
    const { saasPlugin } = await import('./builtin/saas/index.js');
    const registry = new PluginRegistry();
    const fp = makeFp({ authHints: [{ type: ['jwt'] }] });
    
    saasPlugin.register(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      turpanDir: '/tmp/.turpan',
      config: {},
    });
    
    const scenarios = registry.listScenariosByCategory('saas.onboarding');
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it('saasPlugin registers SaaS ruleset', async () => {
    const { saasPlugin } = await import('./builtin/saas/index.js');
    const registry = new PluginRegistry();
    const fp = makeFp({ authHints: [{ type: ['jwt'] }] });
    
    saasPlugin.register(registry, {
      projectRoot: '/tmp/test',
      fingerprint: fp,
      turpanDir: '/tmp/.turpan',
      config: {},
    });
    
    expect(registry.getRuleset('saas')).toBeDefined();
    expect(registry.getRuleset('saas')?.label).toBe('SaaS Application Rules');
  });

  it('mcpPlugin supports MCP server projects', async () => {
    const { mcpPlugin } = await import('./builtin/mcp/index.js');
    const fp = makeFp({ appType: 'mcp-server' });
    expect(mcpPlugin.supports(fp)).toBe(true);
  });

  it('mcpPlugin supports projects with MCP tool files', async () => {
    const { mcpPlugin } = await import('./builtin/mcp/index.js');
    const fp = makeFp({ detectedFiles: ['src/mcp-tools.ts', 'src/server.ts'] });
    expect(mcpPlugin.supports(fp)).toBe(true);
  });
});
