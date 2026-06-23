/**
 * Plugin — Turpan's extension interface.
 * Plugins contribute analyzers, stages, rulesets, report sections,
 * detectors, fixers, UI scenarios, and commands to the review pipeline.
 */
import type { ProjectFingerprint } from '../project/index.js';
import type { Finding } from '../findings/Finding.js';
import type { Analyzer } from '../analyzers/Analyzer.js';
import type { StageId } from '../orchestrator/ReviewStage.js';
import type { PluginContext } from './PluginContext.js';
import type { PluginRegistry } from './PluginRegistry.js';
export interface PluginManifest {
    /** kebab-case plugin id, e.g. "next", "saas" */
    id: string;
    /** Human-readable name */
    name: string;
    /** Semver version */
    version: string;
    /** Short description shown in listings */
    description?: string;
    /** Plugins this one depends on (by id) */
    dependsOn?: string[];
}
export interface PluginAnalyzers {
    /** Standalone analyzers to register */
    analyzers?: Analyzer[];
    /** Analyzer IDs to disable (override built-ins) */
    disableAnalyzers?: string[];
}
export interface PluginStages {
    /** Custom stage IDs to inject into the pipeline */
    stageIds?: StageId[];
    /** Stage configs for plugin-owned stages */
    stageConfigs?: Array<{
        id: StageId;
        label: string;
        categories: string[];
        estimatedTime?: string;
    }>;
}
export interface PluginRuleset {
    /** Unique ruleset id */
    id: string;
    /** Human-readable label */
    label: string;
    /** File globs to include under review (default: all files) */
    include?: string[];
    /** Globs of files to exclude */
    exclude?: string[];
    /** Whether this ruleset is additive (merges with default) or replaces */
    additive?: boolean;
    /** Raw YAML rules content */
    rules?: string;
}
export interface PluginReportSection {
    /** Unique section id */
    id: string;
    /** Heading title */
    title: string;
    /** "findings" | "summary" | "custom" */
    type: 'findings' | 'summary' | 'custom';
    /** For "custom" type: renderer function name */
    render?: string;
    /** Order index (lower = earlier) */
    order?: number;
}
export interface PluginUIScenario {
    /** Scenario id */
    id: string;
    /** Human-readable label */
    label: string;
    /** e.g. "saas.onboarding", "mcp.tool-call" */
    category: string;
    /** Steps to execute */
    steps: Array<{
        action: string;
        target?: string;
        expect?: string;
        timeout?: number;
    }>;
}
export interface PluginProjectDetector {
    /** Unique detector id */
    id: string;
    /** Higher priority runs first */
    priority?: number;
    /** Returns true if this plugin handles the project */
    detect(fingerprint: ProjectFingerprint): boolean;
    /** Extra fingerprint fields this detector contributes */
    enrich?: Partial<ProjectFingerprint>;
}
export interface PluginFixer {
    /** Unique fixer id */
    id: string;
    /** Category of findings this fixer handles */
    category: string;
    /** Whether to auto-apply or ask */
    auto: boolean;
    /** Apply a fix for a given finding */
    fix(finding: Finding, projectRoot: string): Promise<FixResult>;
}
export interface FixResult {
    success: boolean;
    patched?: string[];
    error?: string;
}
export interface PluginCommand {
    /** Command name, e.g. "saas:route-check" */
    name: string;
    /** Short description */
    description?: string;
    /** Execute the command */
    run(ctx: PluginCommandContext): Promise<PluginCommandResult>;
}
export interface PluginCommandContext {
    projectRoot: string;
    fingerprint: ProjectFingerprint;
    args: string[];
    signal?: AbortSignal;
}
export interface PluginCommandResult {
    code: number;
    output: string;
    error?: string;
}
export interface Plugin {
    /** Plugin manifest */
    manifest: PluginManifest;
    /** Whether this plugin applies to the given project */
    supports(fingerprint: ProjectFingerprint): boolean;
    /** Register contributions with the registry */
    register(registry: PluginRegistry, ctx: PluginContext): void;
}
export declare function isPlugin(value: unknown): value is Plugin;
//# sourceMappingURL=Plugin.d.ts.map