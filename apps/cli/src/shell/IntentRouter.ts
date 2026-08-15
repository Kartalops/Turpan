/**
 * IntentRouter — maps parsed intents to review/fix workflows.
 * Deterministic phrase matching first; LLM routing prepared for future.
 *
 * Safety rules:
 * - Ambiguous commands → safest read-only behavior (report only)
 * - "improve code quality" → patch-only by default (no destructive changes)
 * - "clean unused code" → scan and propose, never delete directly
 * - "fix" without --apply → patch-only mode
 * - "fix --apply" required for file modifications
 *
 * Plugin routing:
 * - "use SaaS review skills" → loads saas plugin + runs review
 * - "review this as a Python bot" → loads python plugin + runs review
 * - "review with Next plugin" → loads next plugin + runs review
 */

import type { Intent, ParsedCommand } from '@turpan/shared';
import type { OrchestratorResult } from '@turpan/core';
import { runReview } from '@turpan/core';
import { getIntentLabel } from './intent.js';
import { detectProject, formatFingerprintSummary, type ProjectFingerprint } from '@turpan/core';

export interface RouterContext {
  projectPath: string;
  fingerprint: ProjectFingerprint;
  lastResult?: OrchestratorResult | null;
  fixMode: 'off' | 'patch-only' | 'apply';
  /** Extracted plugin IDs from plugin_review intent */
  pluginIntent?: string[];
  /** Extracted scenario IDs from intent */
  scenarioIntent?: string[];
}

export interface RouterResult {
  intent: Intent;
  label: string;
  action: 'run' | 'report' | 'patch' | 'apply' | 'open' | 'skip';
  description: string;
  /** If set, run this instead of the default orchestrator flow */
  runOptions?: Partial<RouterRunOptions>;
  /** Plugin IDs to load for this run (from plugin_review intent) */
  plugins?: string[];
  /** Scenario IDs for UI testing */
  scenarios?: string[];
}

export interface RouterRunOptions {
  deepAnalysis: boolean;
  uiAnalysis: boolean;
  fixMode: boolean;
  skipBuild: boolean;
  skipTests: boolean;
  skipLint: boolean;
  skipTypecheck: boolean;
  skipSecurity: boolean;
  /** Stage overrides for targeted runs */
  stages?: string[];
  /** Scenario IDs for UI testing */
  scenarios?: string[];
}

// Plugin name mappings for intent extraction
const PLUGIN_KEYWORDS: Record<string, string> = {
  'saas': 'saas',
  'saas review': 'saas',
  'software as a service': 'saas',
  'python': 'python',
  'python bot': 'python',
  'python-bot': 'python',
  'mcp': 'mcp',
  'mcp server': 'mcp',
  'model context protocol': 'mcp',
  'next': 'next',
  'next.js': 'next',
  'nextjs': 'next',
  'vite': 'vite',
  'security': 'security-basic',
  'security basic': 'security-basic',
  'fastapi': 'python',
  'telegram': 'python',
  'chrome extension': 'chrome-extension',
};

function extractPluginsFromCommand(raw: string): string[] {
  const lower = raw.toLowerCase();
  const plugins: string[] = [];

  for (const [keyword, pluginId] of Object.entries(PLUGIN_KEYWORDS)) {
    if (lower.includes(keyword)) {
      if (!plugins.includes(pluginId)) {
        plugins.push(pluginId);
      }
    }
  }

  return plugins;
}

/**
 * Maps intents to their default run options.
 */
const INTENT_OPTIONS: Record<Intent, RouterRunOptions> = {
  analyze:               { deepAnalysis: true,  uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  deep_review:           { deepAnalysis: true,  uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  quick_review:          { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  review:                { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  ui_review:             { deepAnalysis: false, uiAnalysis: true,  fixMode: false, skipBuild: false, skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  runtime_review:        { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: false, skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  code_quality_review:   { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: false, skipTypecheck: false, skipSecurity: true  },
  cleanup_review:        { deepAnalysis: true,  uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  security_review:       { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: false },
  agent_output_audit:    { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  test:                  { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: false, skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  ui:                    { deepAnalysis: false, uiAnalysis: true,  fixMode: false, skipBuild: false, skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  fix_safe:              { deepAnalysis: false, uiAnalysis: false, fixMode: true,  skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  patch_only:            { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  apply_fix:             { deepAnalysis: false, uiAnalysis: false, fixMode: true,  skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  fix:                   { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  }, // patch-only by default
  generate_report:       { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  open_report:           { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  show_findings:         { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  show_scorecard:        { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  report:                { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  'plugin_review':       { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false, scenarios: undefined },
  clean:                 { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  'cleanup-scan':        { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  quality:               { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: false, skipTypecheck: false, skipSecurity: true  },
  'find-unused':         { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  'detect-fake':         { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  run:                   { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  exit:                  { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
  unknown:               { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true,  skipTests: true,  skipLint: true,  skipTypecheck: true,  skipSecurity: true  },
};

/**
 * Maps intents to their action type.
 */
const INTENT_ACTIONS: Record<Intent, RouterResult['action']> = {
  analyze:               'run',
  deep_review:           'run',
  quick_review:          'run',
  review:                'run',
  ui_review:             'run',
  runtime_review:        'run',
  code_quality_review:   'run',
  cleanup_review:        'run',
  security_review:       'run',
  agent_output_audit:    'run',
  test:                  'run',
  ui:                    'run',
  fix_safe:              'patch',
  patch_only:            'patch',
  apply_fix:             'apply',
  fix:                   'patch', // safe default
  generate_report:       'report',
  open_report:           'open',
  show_findings:         'report',
  show_scorecard:        'report',
  report:                'report',
  'plugin_review':        'run',   // Run review with specific plugins
  clean:                 'report', // scan & propose, never delete
  'cleanup-scan':        'report',
  quality:               'run',
  'find-unused':         'report',
  'detect-fake':         'run',
  run:                   'run',
  exit:                  'skip',
  unknown:               'report', // safest default
};

// Scenario name mappings for intent extraction
const SCENARIO_KEYWORDS: Record<string, string> = {
  'marketing': 'saas-marketing',
  'homepage': 'saas-marketing',
  'auth': 'auth',
  'login': 'auth',
  'signin': 'auth',
  'signup': 'auth',
  'registration': 'auth',
  'billing': 'billing',
  'pricing': 'billing',
  'plans': 'billing',
  'checkout': 'billing',
  'dashboard': 'dashboard',
  'admin': 'admin',
  'settings': 'admin',
  'navigation': 'navigation',
  'routing': 'navigation',
  'responsive': 'responsive',
  'mobile': 'responsive',
};

function extractScenariosFromCommand(raw: string): string[] {
  const lower = raw.toLowerCase();
  const scenarios: string[] = [];
  for (const [keyword, scenarioId] of Object.entries(SCENARIO_KEYWORDS)) {
    if (lower.includes(keyword) && !scenarios.includes(scenarioId)) {
      scenarios.push(scenarioId);
    }
  }
  return scenarios;
}

const INTENT_DESCRIPTIONS: Record<Intent, string> = {
  analyze:               'Full deep analysis of the project',
  deep_review:           'Comprehensive multi-stage review',
  quick_review:          'Fast review: typecheck + lint only',
  review:                'Standard review with build + test',
  ui_review:             'UI/visual review with live browser',
  runtime_review:        'Runtime behavior analysis',
  code_quality_review:   'Static quality and complexity analysis',
  cleanup_review:        'Dead code and unused exports scan',
  security_review:       'Security vulnerability scan',
  agent_output_audit:    'Audit AI agent output quality',
  test:                  'Run unit tests',
  ui:                    'Live UI browser test',
  fix_safe:              'Fix only safe, auto-fixable issues',
  patch_only:            'Propose fixes without applying',
  apply_fix:             'Apply fixes to codebase',
  fix:                   'Propose safe fixes (patch-only)',
  generate_report:       'Generate Turpan analysis report',
  open_report:           'Open the latest report in browser',
  show_findings:         'Show findings from last run',
  show_scorecard:        'Show scorecard from last run',
  report:                'Generate or show analysis report',
  'plugin_review':        'Run review with plugin-specific skills',
  clean:                 'Scan and propose code cleanup',
  'cleanup-scan':        'Scan for cleanup opportunities',
  quality:               'Code quality analysis',
  'find-unused':         'Find unused code and exports',
  'detect-fake':         'Detect fake/mocked implementations',
  run:                   'Run a custom command',
  exit:                  'Exit the shell',
  unknown:               'Unrecognized command',
};

export class IntentRouter {
  private ctx: RouterContext;

  constructor(ctx: RouterContext) {
    this.ctx = ctx;
  }

  /**
   * Route a parsed command to a workflow.
   */
  route(parsed: ParsedCommand): RouterResult {
    const { intent } = parsed;
    const label = getIntentLabel(intent);
    const action = INTENT_ACTIONS[intent] ?? 'report';
    const description = INTENT_DESCRIPTIONS[intent] ?? 'No description';
    const runOptions = INTENT_OPTIONS[intent] ?? INTENT_OPTIONS.unknown;

    // Override with explicit flags from parsed command
    const finalOptions = this.applyFlags(runOptions, parsed.flags, action);

    // Extract plugin IDs for plugin_review intent
    let plugins: string[] | undefined;
    if (intent === 'plugin_review') {
      plugins = extractPluginsFromCommand(parsed.raw);
      if (plugins.length === 0) {
        // Fallback: load all auto-detected plugins
        plugins = undefined;
      }
    }

    // Extract scenario IDs from command text (for ui_review / ui intents)
    const scenarios = extractScenariosFromCommand(parsed.raw);

    // Special case: "improve code quality" → patch-only even if intent is 'fix'
    // (handled above via intent mapping)

    // Special case: "clean unused code" → cleanup_scan style, never delete
    if (intent === 'clean' || intent === 'cleanup_review') {
      return { intent, label, action: 'report', description, runOptions: { ...finalOptions, deepAnalysis: true }, plugins };
    }

    return { intent, label, action, description, runOptions: finalOptions, plugins, scenarios };
  }

  /**
   * Apply explicit flags to override default run options.
   */
  private applyFlags(
    base: RouterRunOptions,
    flags: Record<string, string | boolean>,
    action: RouterResult['action']
  ): RouterRunOptions {
    const result = { ...base };

    if (flags['deep'] === true || flags['deep'] === 'true') result.deepAnalysis = true;
    if (flags['ui'] === true || flags['ui'] === 'true') result.uiAnalysis = true;
    if (flags['apply'] === true || flags['apply'] === 'true') {
      result.fixMode = true;
    }
    if (flags['patch-only'] === true || flags['patch-only'] === 'true') {
      result.fixMode = false; // patch-only means no auto-fix applied
    }
    if (flags['skip-build'] === true || flags['skip-build'] === 'true') result.skipBuild = true;
    if (flags['skip-tests'] === true || flags['skip-tests'] === 'true') result.skipTests = true;

    return result;
  }

  /**
   * Get the intent description for display.
   */
  describeIntent(intent: Intent): string {
    return INTENT_DESCRIPTIONS[intent] ?? 'Unknown';
  }

  /**
   * Check if an intent requires a prior run.
   */
  requiresPriorRun(intent: Intent): boolean {
    return ['show_findings', 'show_scorecard', 'open_report'].includes(intent);
  }

  /**
   * Get all available intent labels for help display.
   */
  getAllIntents(): Array<{ intent: Intent; label: string; description: string; action: RouterResult['action'] }> {
    return Object.entries(INTENT_DESCRIPTIONS).map(([intent, description]) => ({
      intent: intent as Intent,
      label: getIntentLabel(intent as Intent),
      description,
      action: INTENT_ACTIONS[intent as Intent] ?? 'report',
    }));
  }
}

/**
 * Convenience: create a router with project context.
 */
export function createRouter(projectPath: string, lastResult?: OrchestratorResult | null): IntentRouter {
  const fingerprint = detectProject(projectPath);
  return new IntentRouter({
    projectPath,
    fingerprint,
    lastResult,
    fixMode: 'off',
  });
}
