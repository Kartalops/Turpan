import type { Intent, ParsedCommand } from '@turpan/shared';

interface IntentPattern {
  intent: Intent;
  patterns: RegExp[];
  /** Short label for display */
  label: string;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ── Analysis / Review intents ──────────────────────────────────────────────
  {
    intent: 'analyze',
    label: 'Analyze',
    patterns: [
      /^(analyze|analysis|audit)$/i,
      /analyze\s+this\s+project/i,
      /deep\s+analysis/i,
      /analyze\s+deeply/i,
    ],
  },
  {
    intent: 'deep_review',
    label: 'Deep Review',
    patterns: [
      /deep\s*review/i,
      /comprehensive\s+review/i,
      /full\s+review/i,
      /thorough\s+review/i,
      /analyze\s+this\s+project\s+deeply/i,
    ],
  },
  {
    intent: 'quick_review',
    label: 'Quick Review',
    patterns: [
      /quick\s*review/i,
      /fast\s+review/i,
      /light\s*review/i,
      /basic\s+review/i,
    ],
  },
  {
    intent: 'review',
    label: 'Review',
    patterns: [
      /^(review|reviewing)$/i,
      /review\s+this/i,
      /run\s+review/i,
      /check\s+the\s+code/i,
    ],
  },
  {
    intent: 'ui_review',
    label: 'UI Review',
    patterns: [
      /ui\s*review/i,
      /visual\s+review/i,
      /ui\s+analysis/i,
      /visual\s+analysis/i,
      /review\s+ui/i,
    ],
  },
  {
    intent: 'runtime_review',
    label: 'Runtime Review',
    patterns: [
      /runtime\s*review/i,
      /runtime\s+analysis/i,
      /runtime\s+test/i,
      /live\s+test/i,
      /run\s+runtime/i,
    ],
  },
    {
    intent: 'code_quality_review',
    label: 'Code Quality Review',
    patterns: [
      /code\s+quality\s+review/i,
      /quality\s+review/i,
      /static\s+analysis/i,
    ],
  },
  {
    intent: 'cleanup_review',
    label: 'Cleanup Review',
    patterns: [
      /cleanup\s*review/i,
      /clean\s+up\s+code/i,
      /clean\s+unused/i,
      /remove\s+unused/i,
      /dead\s+code/i,
      /unused\s+code/i,
      /clean\s+code/i,
    ],
  },
  {
    intent: 'security_review',
    label: 'Security Review',
    patterns: [
      /security\s*review/i,
      /security\s+scan/i,
      /vulnerability\s+scan/i,
      /check\s+security/i,
      /audit\s+security/i,
    ],
  },
  {
    intent: 'agent_output_audit',
    label: 'Agent Output Audit',
    patterns: [
      /agent\s+output\s+audit/i,
      /audit\s+agent\s+output/i,
      /check\s+agent\s+output/i,
      /verify\s+agent/i,
      /agent\s+output/i,
    ],
  },

  // ── Test intents ────────────────────────────────────────────────────────────
  {
    intent: 'test',
    label: 'Test',
    patterns: [
      /^(test|testing|test\s+)$/i,
      /run\s+(unit\s+)?test/i,
      /execute\s+test/i,
      /test\s+this/i,
    ],
  },
  {
    intent: 'ui',
    label: 'UI Test',
    patterns: [
      /^(ui|ui\s+)$/i,
      /live\s+(ui\s+)?test/i,
      /browser\s+test/i,
      /visual\s+test/i,
      /playwright/i,
    ],
  },

  // ── Fix intents (specific patterns before generic "fix") ──────────────────
  {
    intent: 'patch_only',
    label: 'Patch Only',
    patterns: [
      /fix\s+--patch-only/i,
      /patch\s*only/i,
      /plan\s+patch/i,
      /propose\s+fix/i,
      /show\s+fix/i,
      /generate\s+patch/i,
    ],
  },
  {
    intent: 'apply_fix',
    label: 'Apply Fix',
    patterns: [
      /fix\s+--apply/i,
      /apply\s+fix/i,
      /apply\s+patch/i,
      /apply\s+changes/i,
      /fix\s+and\s+apply/i,
    ],
  },
  {
    intent: 'fix_safe',
    label: 'Safe Fix',
    patterns: [
      /fix\s+safe\s+issues?/i,
      /safe\s+fix/i,
      /fix\s+only\s+safe/i,
    ],
  },
  {
    intent: 'fix',
    label: 'Fix',
    patterns: [
      /^(fix)$/i,
      /^fix\s+[a-zA-Z][\w\s]*/i,
      /fix\s+(the\s+)?issues?/i,
      /fix\s+problems/i,
      /improve\s+code\s+quality(?!.*plan)/i,
    ],
  },
  // ── Report intents ──────────────────────────────────────────────────────────
  {
    intent: 'generate_report',
    label: 'Generate Report',
    patterns: [
      /generate\s+(turpan\s+)?analysis/i,
      /generate\s+report/i,
      /create\s+report/i,
    ],
  },
  {
    intent: 'open_report',
    label: 'Open Report',
    patterns: [
      /open\s+report/i,
      /view\s+report/i,
      /show\s+report/i,
      /open\s+analysis/i,
    ],
  },
  {
    intent: 'show_findings',
    label: 'Show Findings',
    patterns: [
      /show\s+findings/i,
      /list\s+findings/i,
      /view\s+findings/i,
      /display\s+findings/i,
    ],
  },
  {
    intent: 'show_scorecard',
    label: 'Show Scorecard',
    patterns: [
      /show\s+scorecard/i,
      /view\s+scorecard/i,
      /display\s+score/i,
      /scorecard/i,
      /score\s+card/i,
    ],
  },
  {
    intent: 'report',
    label: 'Report',
    patterns: [
      /^(report|report\s+)$/i,
      /analysis\s+report/i,
    ],
  },

  // ── Legacy / compatibility intents ─────────────────────────────────────────
  {
    intent: 'clean',
    label: 'Clean',
    patterns: [
      /^(clean|clean\s+)/i,
      /cleanup/i,
    ],
  },
  {
    intent: 'cleanup-scan',
    label: 'Cleanup Scan',
    patterns: [
      /cleanup\s*scan/i,
    ],
  },
  {
    intent: 'quality',
    label: 'Code Quality',
    patterns: [
      /^(quality)$/i,
    ],
  },
  {
    intent: 'find-unused',
    label: 'Find Unused',
    patterns: [
      /find\s+unused/i,
    ],
  },
  {
    intent: 'detect-fake',
    label: 'Detect Fake',
    patterns: [
      /detect\s+fake/i,
    ],
  },
  {
    intent: 'run',
    label: 'Run Command',
    patterns: [
      /^(run|execute)$/i,
    ],
  },

  // ── Plugin-based review intents ─────────────────────────────────────────────
  {
    intent: 'plugin_review',
    label: 'Plugin Review',
    patterns: [
      /use\s+\w+\s+review\s+skills/i,
      /review\s+this\s+as\s+(an?\s+)?(Next\.js|Vite|Python|MCP|SaaS)/i,
      /review\s+as\s+(Next\.js|Vite|Python|MCP|SaaS)/i,
      /review\s+this\s+as\s+(a\s+)?Python(\s+bot)?/i,
      /review\s+this\s+as\s+(a\s+)?MCP\s+server/i,
      /review\s+with\s+(Next\.js|Vite|Python|MCP|SaaS)\s+plugin/i,
      /plugin\s+review/i,
    ],
  },

  // ── Meta intents ────────────────────────────────────────────────────────────
  {
    intent: 'exit',
    label: 'Exit',
    patterns: [
      /^(exit|quit|q|bye|close)$/i,
    ],
  },
];

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);
  const intent = detectIntent(trimmed);

  return {
    intent,
    raw: trimmed,
    args: words.slice(1),
    flags: parseFlags(words),
  };
}

function detectIntent(input: string): Intent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return intent;
      }
    }
  }
  return 'unknown';
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[flagName] = args[++i];
      } else {
        flags[flagName] = true;
      }
    } else if (arg.startsWith('-')) {
      const flagName = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[flagName] = args[++i];
      } else {
        flags[flagName] = true;
      }
    }
  }

  return flags;
}

export function getIntentLabel(intent: Intent): string {
  const entry = INTENT_PATTERNS.find(p => p.intent === intent);
  if (entry) return entry.label;

  const labels: Record<string, string> = {
    analyze: 'Analyze',
    review: 'Review',
    test: 'Test',
    ui: 'UI Test',
    clean: 'Clean',
    fix: 'Fix',
    report: 'Report',
    exit: 'Exit',
    unknown: 'Unknown',
    'cleanup-scan': 'Cleanup Scan',
    quality: 'Code Quality',
    'find-unused': 'Find Unused Code',
    'detect-fake': 'Detect Fake Implementation',
    run: 'Run Command',
    deep_review: 'Deep Review',
    quick_review: 'Quick Review',
    ui_review: 'UI Review',
    runtime_review: 'Runtime Review',
    code_quality_review: 'Code Quality Review',
    cleanup_review: 'Cleanup Review',
    security_review: 'Security Review',
    agent_output_audit: 'Agent Output Audit',
    fix_safe: 'Safe Fix',
    patch_only: 'Patch Only',
    apply_fix: 'Apply Fix',
    generate_report: 'Generate Report',
    open_report: 'Open Report',
    show_findings: 'Show Findings',
    show_scorecard: 'Show Scorecard',
  };
  return labels[intent] ?? 'Unknown';
}

export function getAvailableCommands(): string[] {
  return [
    'analyze this project deeply',
    'deep review',
    'quick review',
    'ui review',
    'runtime review',
    'code quality review',
    'security review',
    'agent output audit',
    'review this project',
    'use SaaS review skills',
    'review this as a Python bot',
    'review this as an MCP server',
    'review with Next plugin',
    'run unit tests',
    'run live UI test',
    'cleanup review',
    'find unused code',
    'improve code quality',
    'fix safe issues',
    'fix --patch-only',
    'fix --apply',
    'generate Turpan Analysis',
    'open report',
    'show findings',
    'show scorecard',
    'exit',
  ];
}

export function getCommandCategories(): Record<string, string[]> {
  return {
    Analysis: [
      'analyze this project deeply',
      'deep review',
      'quick review',
    ],
    Quality: [
      'code quality review',
      'cleanup review',
      'find unused code',
      'security review',
      'agent output audit',
    ],
    Runtime: [
      'runtime review',
      'run unit tests',
      'run live UI test',
      'ui review',
    ],
    Fix: [
      'improve code quality',
      'fix safe issues',
      'fix --patch-only',
      'fix --apply',
    ],
    Report: [
      'generate Turpan Analysis',
      'open report',
      'show findings',
      'show scorecard',
    ],
    Meta: [
      'exit',
    ],
  };
}