/**
 * PluginRegistry — tracks and coordinates all registered plugins.
 * Plugins register analyzers, stages, rulesets, report sections,
 * detectors, fixers, UI scenarios, and commands through the registry.
 */

import type { ProjectFingerprint } from '../project/index.js';
import type { Analyzer } from '../analyzers/Analyzer.js';
import type { StageId } from '../orchestrator/ReviewStage.js';
import type {
  Plugin,
  PluginManifest,
  PluginRuleset,
  PluginReportSection,
  PluginUIScenario,
  PluginProjectDetector,
  PluginFixer,
  PluginCommand,
  PluginCommandContext,
  PluginCommandResult,
} from './Plugin.js';

export interface RegisteredAnalyzer {
  analyzer: Analyzer;
  pluginId: string;
}

export interface RegisteredRuleset {
  ruleset: PluginRuleset;
  pluginId: string;
}

export interface RegisteredReportSection {
  section: PluginReportSection;
  pluginId: string;
}

export interface RegisteredUIScenario {
  scenario: PluginUIScenario;
  pluginId: string;
}

export interface RegisteredDetector {
  detector: PluginProjectDetector;
  pluginId: string;
  priority: number;
}

export interface RegisteredFixer {
  fixer: PluginFixer;
  pluginId: string;
}

export interface RegisteredCommand {
  command: PluginCommand;
  pluginId: string;
}

/**
 * Central plugin registry — singleton-like, but instantiated per-run
 * so multiple reviews can run with different plugin sets in parallel.
 */
export class PluginRegistry {
  // ── Registrations ───────────────────────────────────────────────────────────
  private _plugins = new Map<string, Plugin>();
  private _analyzers = new Map<string, RegisteredAnalyzer>();
  private _rulesets = new Map<string, RegisteredRuleset>();
  private _reportSections = new Map<string, RegisteredReportSection>();
  private _scenarios = new Map<string, RegisteredUIScenario>();
  private _detectors = new Map<string, RegisteredDetector>();
  private _fixers = new Map<string, RegisteredFixer>();
  private _commands = new Map<string, RegisteredCommand>();

  // Active stage IDs contributed by plugins
  private _stageIds = new Set<StageId>();

  // Disabled analyzer IDs (from plugins that override built-ins)
  private _disabledAnalyzers = new Set<string>();

  // ── Plugin Management ──────────────────────────────────────────────────────

  registerPlugin(plugin: Plugin): void {
    if (this._plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered`);
    }
    this._plugins.set(plugin.manifest.id, plugin);
  }

  unregisterPlugin(id: string): void {
    this._plugins.delete(id);

    // Cascade: remove all contributions from this plugin
    for (const [key, val] of this._analyzers) {
      if (val.pluginId === id) this._analyzers.delete(key);
    }
    for (const [key, val] of this._rulesets) {
      if (val.pluginId === id) this._rulesets.delete(key);
    }
    for (const [key, val] of this._reportSections) {
      if (val.pluginId === id) this._reportSections.delete(key);
    }
    for (const [key, val] of this._scenarios) {
      if (val.pluginId === id) this._scenarios.delete(key);
    }
    for (const [key, val] of this._detectors) {
      if (val.pluginId === id) this._detectors.delete(key);
    }
    for (const [key, val] of this._fixers) {
      if (val.pluginId === id) this._fixers.delete(key);
    }
    for (const [key, val] of this._commands) {
      if (val.pluginId === id) this._commands.delete(key);
    }
  }

  getPlugin(id: string): Plugin | undefined {
    return this._plugins.get(id);
  }

  listPlugins(): PluginManifest[] {
    return [...this._plugins.values()].map(p => p.manifest);
  }

  // ── Analyzer Registration ─────────────────────────────────────────────────

  registerAnalyzer(analyzer: Analyzer, pluginId: string): void {
    if (this._analyzers.has(analyzer.id)) {
      throw new Error(`Analyzer "${analyzer.id}" already registered by "${this._analyzers.get(analyzer.id)!.pluginId}"`);
    }
    this._analyzers.set(analyzer.id, { analyzer, pluginId });
  }

  disableAnalyzer(id: string): void {
    this._disabledAnalyzers.add(id);
    this._analyzers.delete(id);
  }

  getAnalyzer(id: string): Analyzer | undefined {
    const entry = this._analyzers.get(id);
    return entry?.analyzer;
  }

  listAnalyzers(): RegisteredAnalyzer[] {
    return [...this._analyzers.values()];
  }

  listEnabledAnalyzerIds(): string[] {
    return [...this._analyzers.keys()].filter(id => !this._disabledAnalyzers.has(id));
  }

  isAnalyzerDisabled(id: string): boolean {
    return this._disabledAnalyzers.has(id);
  }

  // ── Ruleset Registration ───────────────────────────────────────────────────

  registerRuleset(ruleset: PluginRuleset, pluginId: string): void {
    this._rulesets.set(ruleset.id, { ruleset, pluginId });
  }

  getRuleset(id: string): PluginRuleset | undefined {
    return this._rulesets.get(id)?.ruleset;
  }

  listRulesets(): RegisteredRuleset[] {
    return [...this._rulesets.values()];
  }

  // ── Report Section Registration ────────────────────────────────────────────

  registerReportSection(section: PluginReportSection, pluginId: string): void {
    this._reportSections.set(section.id, { section, pluginId });
  }

  listReportSections(): RegisteredReportSection[] {
    return [...this._reportSections.values()].sort((a, b) => (a.section.order ?? 99) - (b.section.order ?? 99));
  }

  // ── UI Scenario Registration ──────────────────────────────────────────────

  registerUIScenario(scenario: PluginUIScenario, pluginId: string): void {
    this._scenarios.set(scenario.id, { scenario, pluginId });
  }

  getScenario(id: string): PluginUIScenario | undefined {
    return this._scenarios.get(id)?.scenario;
  }

  listScenarios(): RegisteredUIScenario[] {
    return [...this._scenarios.values()];
  }

  listScenariosByCategory(category: string): PluginUIScenario[] {
    return this.listScenarios()
      .filter(r => r.scenario.category === category)
      .map(r => r.scenario);
  }

  // ── Project Detector Registration ──────────────────────────────────────────

  registerDetector(detector: PluginProjectDetector, pluginId: string): void {
    const priority = detector.priority ?? 50;
    this._detectors.set(detector.id, { detector, pluginId, priority });
  }

  listDetectors(): RegisteredDetector[] {
    return [...this._detectors.values()].sort((a, b) => b.priority - a.priority);
  }

  // ── Fixer Registration ──────────────────────────────────────────────────────

  registerFixer(fixer: PluginFixer, pluginId: string): void {
    this._fixers.set(fixer.id, { fixer, pluginId });
  }

  getFixer(category: string): PluginFixer | undefined {
    // Return first fixer that handles this category
    for (const entry of this._fixers.values()) {
      if (entry.fixer.category === category) return entry.fixer;
    }
    return undefined;
  }

  listFixers(): RegisteredFixer[] {
    return [...this._fixers.values()];
  }

  // ── Command Registration ───────────────────────────────────────────────────

  registerCommand(command: PluginCommand, pluginId: string): void {
    this._commands.set(command.name, { command, pluginId });
  }

  getCommand(name: string): PluginCommand | undefined {
    return this._commands.get(name)?.command;
  }

  listCommands(): RegisteredCommand[] {
    return [...this._commands.values()];
  }

  // ── Stage IDs ──────────────────────────────────────────────────────────────

  addStageId(id: StageId): void {
    this._stageIds.add(id);
  }

  getStageIds(): StageId[] {
    return [...this._stageIds];
  }

  // ── Query: Which plugins support this project? ─────────────────────────────

  pluginsFor(fingerprint: ProjectFingerprint): Plugin[] {
    return [...this._plugins.values()].filter(p => p.supports(fingerprint));
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  /** Returns a serializable summary for debugging/reporting */
  toSummary(): PluginRegistrySummary {
    return {
      plugins: this.listPlugins(),
      analyzerCount: this._analyzers.size,
      rulesetCount: this._rulesets.size,
      reportSectionCount: this._reportSections.size,
      scenarioCount: this._scenarios.size,
      detectorCount: this._detectors.size,
      fixerCount: this._fixers.size,
      commandCount: this._commands.size,
      stageIds: [...this._stageIds],
      disabledAnalyzers: [...this._disabledAnalyzers],
    };
  }
}

export interface PluginRegistrySummary {
  plugins: PluginManifest[];
  analyzerCount: number;
  rulesetCount: number;
  reportSectionCount: number;
  scenarioCount: number;
  detectorCount: number;
  fixerCount: number;
  commandCount: number;
  stageIds: StageId[];
  disabledAnalyzers: string[];
}
