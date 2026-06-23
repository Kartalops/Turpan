/**
 * TaskParser — parses the agent task/prompt and extracts expected capabilities
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ParsedTask, Capability, CapabilityCategory } from './types.js';

// ── Capability Keywords ───────────────────────────────────────────────────────

const CAPABILITY_PATTERNS: Array<{ category: CapabilityCategory; keywords: RegExp[] }> = [
  {
    category: 'ui-pages',
    keywords: [
      /\b(dashboard|landing\s+page|home\s+page|marketing\s+page|settings\s+page|profile\s+page|login|signup|register|checkout|pricing)\b/i,
      /\b(UI|user\s+interface|frontend|web\s+page|page\s+layout|responsive)\b/i,
    ],
  },
  {
    category: 'backend-endpoints',
    keywords: [
      /\b(api\s+route|endpoint|REST|GraphQL|mutation|query|handler|controller|server)\b/i,
      /\bPOST|GET|PUT|DELETE|PATCH\b.*(?:route|endpoint|handler)/i,
    ],
  },
  {
    category: 'auth',
    keywords: [
      /\b(auth|authentication|authorization|JWT|OAuth|session|login|logout|signup|register|password|2FA|MFA|role|permission)\b/i,
    ],
  },
  {
    category: 'billing',
    keywords: [
      /\b(billing|payment|stripe|subscription|pricing|checkout|invoice|plan|upgrade|cancel|refund)\b/i,
    ],
  },
  {
    category: 'dashboard',
    keywords: [
      /\b(dashboard|analytics|metrics|chart|graph|widget|overview|stats|kpi|report)\b/i,
    ],
  },
  {
    category: 'tests',
    keywords: [
      /\b(test|spec|unit\s+test|integration\s+test|e2e|playwright|vitest|jest|cypress)\b/i,
    ],
  },
  {
    category: 'mcp-server',
    keywords: [
      /\b(MCP|mcp-server|model\s+context\s+protocol|tool\s+registry|resource\s+provider)\b/i,
    ],
  },
  {
    category: 'cli',
    keywords: [
      /\b(CLI|command.*line|commander|yargs|shell\s+script|bin\s+script|executable)\b/i,
    ],
  },
  {
    category: 'database',
    keywords: [
      /\b(database|schema|prisma|drizzle|migration|model|query|ORM|sqlite|postgres|mongodb)\b/i,
    ],
  },
  {
    category: 'integrations',
    keywords: [
      /\b(integration|webhook|third.*party|external\s+API|email|sendgrid|twilio|Slack|discord)\b/i,
    ],
  },
  {
    category: 'deployment',
    keywords: [
      /\b(deploy|docker|vercel|netlify|github\s+action|CI\/CD|kubernetes|environment)\b/i,
    ],
  },
  {
    category: 'docs',
    keywords: [
      /\b(documentation|README|docs|swagger|OpenAPI|API\s+docs|changelog)\b/i,
    ],
  },
  {
    category: 'api-design',
    keywords: [
      /\b(restful|api\s+design|versioning|rate\s+limit|cors|validation|middleware)\b/i,
    ],
  },
  {
    category: 'workers',
    keywords: [
      /\b(worker|queue|background\s+job|cron|scheduler|retry|DLQ|idempotent)\b/i,
    ],
  },
  {
    category: 'error-handling',
    keywords: [
      /\b(error\s+handling|exception|fallback|circuit\s+breaker|retry|graceful\s+degradation)\b/i,
    ],
  },
  {
    category: 'logging',
    keywords: [
      /\b(logging|logger|log\s+level|observability|tracing|debug|info|warn|error)\b/i,
    ],
  },
  {
    category: 'monitoring',
    keywords: [
      /\b(monitoring|alerting|health\s+check|uptime|heartbeat|status\s+page)\b/i,
    ],
  },
  {
    category: 'security',
    keywords: [
      /\b(security|XSS|CSRF|SQL\s+injection|HTTPS|TLS|secret\s+management|env\s+var|sanitize)\b/i,
    ],
  },
  {
    category: 'config',
    keywords: [
      /\b(configuration|config|settings|environment\s+variable|\.env|options)\b/i,
    ],
  },
];

// ── Agent Type Detection ─────────────────────────────────────────────────────

const AGENT_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  { type: 'claude-code', patterns: [/claude[\-\s]?code|claude\s+code/i] },
  { type: 'opencode', patterns: [/opencode/i] },
  { type: 'cursor', patterns: [/cursor/i] },
  { type: 'windsurf', patterns: [/windsurf/i] },
  { type: 'aider', patterns: [/aider/i] },
  { type: 'gitHub-copilot', patterns: [/github\s+copilot|copilot/i] },
  { type: 'devin', patterns: [/devin/i] },
  { type: 'agent', patterns: [/^(agent|ai\s+agent)\b/i] },
];

/**
 * Parse a task file and extract expected capabilities
 */
export function parseTaskText(text: string, source: ParsedTask['source'] = 'shell'): ParsedTask {
  const capabilities = extractCapabilities(text);
  const agentType = detectAgentType(text);
  const projectHints = extractProjectHints(text);

  return {
    rawText: text,
    source,
    capabilities,
    agentType,
    projectHints,
  };
}

/**
 * Load task from a file path
 */
export function loadTaskFile(taskPath: string): ParsedTask {
  const rawText = readFileSync(taskPath, 'utf-8');
  return parseTaskText(rawText, 'file');
}

/**
 * Load task from .turpan/task.md if it exists
 */
export function loadDefaultTask(projectRoot: string): ParsedTask | null {
  const defaultPath = join(projectRoot, '.turpan', 'task.md');
  try {
    return loadTaskFile(defaultPath);
  } catch {
    return null;
  }
}

function extractCapabilities(text: string): Capability[] {
  const seen = new Set<string>();
  const capabilities: Capability[] = [];

  for (const { category, keywords } of CAPABILITY_PATTERNS) {
    for (const keyword of keywords) {
      const match = keyword.exec(text);
      if (match) {
        const key = `${category}:${match[0]}`;
        if (!seen.has(key)) {
          seen.add(key);
          capabilities.push({
            category,
            name: match[0].trim(),
            description: extractSurroundingText(text, match.index, 80),
            evidence: match[0],
          });
        }
        break; // one match per category per keyword group is enough
      }
    }
  }

  // Deduplicate by category
  const byCategory = new Map<CapabilityCategory, Capability>();
  for (const cap of capabilities) {
    if (!byCategory.has(cap.category)) {
      byCategory.set(cap.category, cap);
    }
  }

  return [...byCategory.values()];
}

function detectAgentType(text: string): string | undefined {
  for (const { type, patterns } of AGENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type;
    }
  }
  return undefined;
}

function extractProjectHints(text: string): string[] {
  const hints: string[] = [];

  // Framework hints
  const frameworkPatterns = [
    { pattern: /nextjs|next\.js/i, value: 'nextjs' },
    { pattern: /react/i, value: 'react' },
    { pattern: /vue/i, value: 'vue' },
    { pattern: /nuxt/i, value: 'nuxt' },
    { pattern: /svelte/i, value: 'svelte' },
    { pattern: /astro/i, value: 'astro' },
    { pattern: /fastapi/i, value: 'fastapi' },
    { pattern: /flask/i, value: 'flask' },
    { pattern: /django/i, value: 'django' },
    { pattern: /express/i, value: 'express' },
    { pattern: /node\.js|nodejs/i, value: 'node' },
    { pattern: /python/i, value: 'python' },
    { pattern: /typescript/i, value: 'typescript' },
    { pattern: /go|golang/i, value: 'go' },
    { pattern: /rust/i, value: 'rust' },
    { pattern: /prisma/i, value: 'prisma' },
    { pattern: /stripe/i, value: 'stripe' },
    { pattern: /mcp/i, value: 'mcp' },
  ];

  for (const { pattern, value } of frameworkPatterns) {
    if (pattern.test(text)) hints.push(value);
  }

  return [...new Set(hints)];
}

function extractSurroundingText(text: string, index: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + excerpt + (end < text.length ? '…' : '');
}
