/**
 * PluginRegistry — tracks and coordinates all registered plugins.
 * Plugins register analyzers, stages, rulesets, report sections,
 * detectors, fixers, UI scenarios, and commands through the registry.
 */
import type { ProjectFingerprint } from '../project/index.js';
import type { Analyzer } from '../analyzers/Analyzer.js';
import type { StageId } from '../orchestrator/ReviewStage.js';
import type { Plugin, PluginManifest, PluginRuleset, PluginReportSection, PluginUIScenario, PluginProjectDetector, PluginFixer, PluginCommand } from './Plugin.js';
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
export declare class PluginRegistry {
    private _plugins;
    private _analyzers;
    private _rulesets;
    private _reportSections;
    private _scenarios;
    private _detectors;
    private _fixers;
    private _commands;
    private _stageIds;
    private _disabledAnalyzers;
    registerPlugin(plugin: Plugin): void;
    unregisterPlugin(id: string): void;
    getPlugin(id: string): Plugin | undefined;
    listPlugins(): PluginManifest[];
    registerAnalyzer(analyzer: Analyzer, pluginId: string): void;
    disableAnalyzer(id: string): void;
    getAnalyzer(id: string): Analyzer | undefined;
    listAnalyzers(): RegisteredAnalyzer[];
    listEnabledAnalyzerIds(): string[];
    isAnalyzerDisabled(id: string): boolean;
    registerRuleset(ruleset: PluginRuleset, pluginId: string): void;
    getRuleset(id: string): PluginRuleset | undefined;
    listRulesets(): RegisteredRuleset[];
    registerReportSection(section: PluginReportSection, pluginId: string): void;
    listReportSections(): RegisteredReportSection[];
    registerUIScenario(scenario: PluginUIScenario, pluginId: string): void;
    getScenario(id: string): PluginUIScenario | undefined;
    listScenarios(): RegisteredUIScenario[];
    listScenariosByCategory(category: string): PluginUIScenario[];
    registerDetector(detector: PluginProjectDetector, pluginId: string): void;
    listDetectors(): RegisteredDetector[];
    registerFixer(fixer: PluginFixer, pluginId: string): void;
    getFixer(category: string): PluginFixer | undefined;
    listFixers(): RegisteredFixer[];
    registerCommand(command: PluginCommand, pluginId: string): void;
    getCommand(name: string): PluginCommand | undefined;
    listCommands(): RegisteredCommand[];
    addStageId(id: StageId): void;
    getStageIds(): StageId[];
    pluginsFor(fingerprint: ProjectFingerprint): Plugin[];
    /** Returns a serializable summary for debugging/reporting */
    toSummary(): PluginRegistrySummary;
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
//# sourceMappingURL=PluginRegistry.d.ts.map