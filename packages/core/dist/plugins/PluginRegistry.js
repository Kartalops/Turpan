/**
 * PluginRegistry — tracks and coordinates all registered plugins.
 * Plugins register analyzers, stages, rulesets, report sections,
 * detectors, fixers, UI scenarios, and commands through the registry.
 */
/**
 * Central plugin registry — singleton-like, but instantiated per-run
 * so multiple reviews can run with different plugin sets in parallel.
 */
export class PluginRegistry {
    // ── Registrations ───────────────────────────────────────────────────────────
    _plugins = new Map();
    _analyzers = new Map();
    _rulesets = new Map();
    _reportSections = new Map();
    _scenarios = new Map();
    _detectors = new Map();
    _fixers = new Map();
    _commands = new Map();
    // Active stage IDs contributed by plugins
    _stageIds = new Set();
    // Disabled analyzer IDs (from plugins that override built-ins)
    _disabledAnalyzers = new Set();
    // ── Plugin Management ──────────────────────────────────────────────────────
    registerPlugin(plugin) {
        if (this._plugins.has(plugin.manifest.id)) {
            throw new Error(`Plugin "${plugin.manifest.id}" is already registered`);
        }
        this._plugins.set(plugin.manifest.id, plugin);
    }
    unregisterPlugin(id) {
        this._plugins.delete(id);
        // Cascade: remove all contributions from this plugin
        for (const [key, val] of this._analyzers) {
            if (val.pluginId === id)
                this._analyzers.delete(key);
        }
        for (const [key, val] of this._rulesets) {
            if (val.pluginId === id)
                this._rulesets.delete(key);
        }
        for (const [key, val] of this._reportSections) {
            if (val.pluginId === id)
                this._reportSections.delete(key);
        }
        for (const [key, val] of this._scenarios) {
            if (val.pluginId === id)
                this._scenarios.delete(key);
        }
        for (const [key, val] of this._detectors) {
            if (val.pluginId === id)
                this._detectors.delete(key);
        }
        for (const [key, val] of this._fixers) {
            if (val.pluginId === id)
                this._fixers.delete(key);
        }
        for (const [key, val] of this._commands) {
            if (val.pluginId === id)
                this._commands.delete(key);
        }
    }
    getPlugin(id) {
        return this._plugins.get(id);
    }
    listPlugins() {
        return [...this._plugins.values()].map(p => p.manifest);
    }
    // ── Analyzer Registration ─────────────────────────────────────────────────
    registerAnalyzer(analyzer, pluginId) {
        if (this._analyzers.has(analyzer.id)) {
            throw new Error(`Analyzer "${analyzer.id}" already registered by "${this._analyzers.get(analyzer.id).pluginId}"`);
        }
        this._analyzers.set(analyzer.id, { analyzer, pluginId });
    }
    disableAnalyzer(id) {
        this._disabledAnalyzers.add(id);
        this._analyzers.delete(id);
    }
    getAnalyzer(id) {
        const entry = this._analyzers.get(id);
        return entry?.analyzer;
    }
    listAnalyzers() {
        return [...this._analyzers.values()];
    }
    listEnabledAnalyzerIds() {
        return [...this._analyzers.keys()].filter(id => !this._disabledAnalyzers.has(id));
    }
    isAnalyzerDisabled(id) {
        return this._disabledAnalyzers.has(id);
    }
    // ── Ruleset Registration ───────────────────────────────────────────────────
    registerRuleset(ruleset, pluginId) {
        this._rulesets.set(ruleset.id, { ruleset, pluginId });
    }
    getRuleset(id) {
        return this._rulesets.get(id)?.ruleset;
    }
    listRulesets() {
        return [...this._rulesets.values()];
    }
    // ── Report Section Registration ────────────────────────────────────────────
    registerReportSection(section, pluginId) {
        this._reportSections.set(section.id, { section, pluginId });
    }
    listReportSections() {
        return [...this._reportSections.values()].sort((a, b) => (a.section.order ?? 99) - (b.section.order ?? 99));
    }
    // ── UI Scenario Registration ──────────────────────────────────────────────
    registerUIScenario(scenario, pluginId) {
        this._scenarios.set(scenario.id, { scenario, pluginId });
    }
    getScenario(id) {
        return this._scenarios.get(id)?.scenario;
    }
    listScenarios() {
        return [...this._scenarios.values()];
    }
    listScenariosByCategory(category) {
        return this.listScenarios()
            .filter(r => r.scenario.category === category)
            .map(r => r.scenario);
    }
    // ── Project Detector Registration ──────────────────────────────────────────
    registerDetector(detector, pluginId) {
        const priority = detector.priority ?? 50;
        this._detectors.set(detector.id, { detector, pluginId, priority });
    }
    listDetectors() {
        return [...this._detectors.values()].sort((a, b) => b.priority - a.priority);
    }
    // ── Fixer Registration ──────────────────────────────────────────────────────
    registerFixer(fixer, pluginId) {
        this._fixers.set(fixer.id, { fixer, pluginId });
    }
    getFixer(category) {
        // Return first fixer that handles this category
        for (const entry of this._fixers.values()) {
            if (entry.fixer.category === category)
                return entry.fixer;
        }
        return undefined;
    }
    listFixers() {
        return [...this._fixers.values()];
    }
    // ── Command Registration ───────────────────────────────────────────────────
    registerCommand(command, pluginId) {
        this._commands.set(command.name, { command, pluginId });
    }
    getCommand(name) {
        return this._commands.get(name)?.command;
    }
    listCommands() {
        return [...this._commands.values()];
    }
    // ── Stage IDs ──────────────────────────────────────────────────────────────
    addStageId(id) {
        this._stageIds.add(id);
    }
    getStageIds() {
        return [...this._stageIds];
    }
    // ── Query: Which plugins support this project? ─────────────────────────────
    pluginsFor(fingerprint) {
        return [...this._plugins.values()].filter(p => p.supports(fingerprint));
    }
    // ── Snapshot ───────────────────────────────────────────────────────────────
    /** Returns a serializable summary for debugging/reporting */
    toSummary() {
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
//# sourceMappingURL=PluginRegistry.js.map