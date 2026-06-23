/**
 * FakeImplementationAnalyzer — detects fake/shallow implementations
 *
 * Detects patterns where a function promises external integration but returns
 * hardcoded success, or where payment/auth/email/database logic is mocked
 * without clear development-only boundary.
 */

import { readFileSync, readdirSync } from 'fs';
import type { Finding } from '@turpan/core';
import { createFinding, confidence } from '@turpan/core';
import type { AgentOutputIssue, EvidenceSnippet } from './types.js';

// ── Fake Pattern Signatures ───────────────────────────────────────────────────

interface FakePattern {
  /** Regex or string to search for in file content */
  pattern: RegExp;
  /** What category this matches */
  capability: string;
  /** Human-readable label */
  label: string;
  /** Severity of this fake pattern */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Additional context lines needed around the match */
  contextRadius?: number;
}

const FAKE_PATTERNS: FakePattern[] = [
  // Stripe fake checkout
  {
    pattern: /stripe|payment|checkout|subscribe|paymentIntent/i,
    capability: 'billing',
    label: 'Stripe/Payment referenced but may be fake',
    severity: 'high',
  },
  // Auth fakes
  {
    pattern: /authenticate|login|jwt\.sign|jwt\.verify|bcrypt|argon/i,
    capability: 'auth',
    label: 'Auth logic referenced — verify it is real',
    severity: 'high',
  },
  // Email fakes
  {
    pattern: /sendgrid|nodemailer|email.*send|mailer|mailgun/i,
    capability: 'integrations',
    label: 'Email service referenced — verify it is wired',
    severity: 'medium',
  },
  // Database fakes
  {
    pattern: /prisma|sequelize|typeorm|drizzle|db\.|mongodb|postgres|redis/i,
    capability: 'database',
    label: 'Database ORM referenced — verify it is connected',
    severity: 'high',
  },
  // External API fakes
  {
    pattern: /openai|anthropic|gemini|llm|ai\.|\.predict|model\.generate/i,
    capability: 'integrations',
    label: 'AI/LLM integration referenced — verify API key is required',
    severity: 'medium',
  },
  // Slack/Discord webhooks
  {
    pattern: /slack|discord|webhook|notify/i,
    capability: 'integrations',
    label: 'Notification service referenced — verify it is configured',
    severity: 'low',
  },
];

// ── Fake Body Signatures ─────────────────────────────────────────────────────
// These look for function bodies that return hardcoded success without real work

const HARDCODED_SUCCESS_PATTERNS: Array<{ pattern: RegExp; label: string; severity: 'critical' | 'high' | 'medium' }> = [
  {
    // async function payment() { return true; }
    pattern: /(?:async\s+)?function\s+\w*[payment|stripe|billing|checkout|subscribe|charge]\w*[\s\S]{0,200}?(?:return\s+true|return\s+[{[]|return\s+["'](?:success|ok)["'])/i,
    label: 'Payment function returns hardcoded success without real Stripe call',
    severity: 'critical',
  },
  {
    // export async function sendEmail() { return true; }
    pattern: /(?:export\s+)?(?:async\s+)?function\s+\w*[email|mail|send|nodemailer|sendgrid]\w*[\s\S]{0,200}?return\s+true/i,
    label: 'Email function returns hardcoded success without real email dispatch',
    severity: 'high',
  },
  {
    // const login = async () => { return { token: 'fake' }; }
    pattern: /(?:export\s+)?const\s+\w*[login|auth|signin]\w*\s*=\s*(?:async\s+)?\(\)\s*=>\s*[{][\s\S]{0,200}?return\s+[{][\s\S]{0,50}?(?:token|user|session)["\']?\s*:\s*["'][^"']{5,20}["']/i,
    label: 'Auth function returns fake session without real JWT verification',
    severity: 'critical',
  },
  {
    // const stripe = {};  export const stripe = { create: () => true };
    pattern: /(?:export\s+)?const\s+\w*[stripe|paypal|billing]\w*\s*=\s*[{][\s\S]{0,100}?:\s*(?:\(\)\s*=>\s*)?true/i,
    label: 'Payment client is stubbed with hardcoded return values',
    severity: 'critical',
  },
  {
    // return res.json({ success: true })  // without any actual DB write
    pattern: /return\s+(?:res\.)?json\s*\(\s*[{]\s*success\s*:\s*true\s*[}]\s*\)/i,
    label: 'Endpoint returns success JSON without actual data persistence',
    severity: 'high',
  },
  {
    // export const config = { apiKey: 'sk_...fake' }
    pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{10,60}["']/i,
    label: 'Hardcoded credential or API key in source code',
    severity: 'critical',
  },
  {
    // TODO: implement / FIXME: remove / coming soon in real code paths
    pattern: /(?:TODO|FIXME|HACK|XXX|coming\s*soon|not\s*yet\s*implemented)\s*[:\-]?\s*(?:payment|stripe|email|auth|login|billing|db|database)/i,
    label: 'Placeholder comment in production code path — real implementation missing',
    severity: 'high',
  },
];

// ── Analyzer ─────────────────────────────────────────────────────────────────

export interface AnalyzeFakeOptions {
  projectRoot: string;
  files: string[];
  taskCapabilities: string[]; // capability categories from the task
}

export function analyzeFakeImplementations(opts: AnalyzeFakeOptions): AgentOutputIssue[] {
  const { projectRoot, files, taskCapabilities } = opts;
  const issues: AgentOutputIssue[] = [];

  for (const file of files) {
    const relPath = file.replace(projectRoot + '/', '');
    if (isLikelyTestOrConfig(relPath)) continue;

    let content = '';
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    // Check for hardcoded success patterns
    for (const { pattern, label, severity } of HARDCODED_SUCCESS_PATTERNS) {
      const match = pattern.exec(content);
      if (match) {
        const contextStart = Math.max(0, match.index - 80);
        const contextEnd = Math.min(content.length, match.index + match[0].length + 80);
        const excerpt = content.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim();

        issues.push({
          kind: 'fake-implementation',
          severity,
          title: label,
          explanation: `In ${relPath}: found a function body that appears to return hardcoded success without real integration. This is a common sign of placeholder or fake implementation.`,
          file: relPath,
          suggestedFix: 'Verify this function makes real external API calls. If it is intentionally mocked for development, move the mock behind an IS_DEV flag or into a dedicated mock module.',
          confidence: 85,
          evidence: [{ type: 'code', path: relPath, excerpt }],
        });
      }
    }

    // Check capability-specific fake patterns
    const fileName = relPath.split('/').pop() ?? '';
    for (const { pattern, capability, label, severity } of FAKE_PATTERNS) {
      if (pattern.test(relPath) || pattern.test(content)) {
        // Check if it's already covered by a hardcoded pattern
        const alreadyCovered = issues.some(i => i.file === relPath && i.kind === 'fake-implementation');
        if (alreadyCovered) continue;

        // Check if the capability was in the task
        const relevantToTask = taskCapabilities.includes(capability);
        if (!relevantToTask) continue;

        // Look for suspicious code patterns around the match
        const matches = content.match(new RegExp(pattern.source, 'gi')) ?? [];
        if (matches.length === 0) continue;

        issues.push({
          kind: 'fake-implementation',
          severity,
          title: label,
          explanation: `File ${relPath} references ${capability} logic. Verify it is actually wired to a real service and not just stubbed.`,
          file: relPath,
          suggestedFix: `Check if ${fileName} makes real API calls. Look for: (1) actual API client instantiation, (2) real network requests, (3) proper error handling, (4) timeout configuration.`,
          confidence: 65,
          evidence: [
            {
              type: 'code',
              path: relPath,
              excerpt: content.slice(0, 300).replace(/\s+/g, ' ').trim(),
            },
          ],
        });
      }
    }
  }

  return issues;
}

function isLikelyTestOrConfig(relPath: string): boolean {
  return /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(relPath)
    || /(^|\/)mocks?(\/|$)/i.test(relPath)
    || /(^|\/)fixtures?(\/|$)/i.test(relPath)
    || /(^|\/)stub[sd]?(\/|$)/i.test(relPath)
    || /\.(test|spec)\.(ts|js)$/.test(relPath)
    || /vite|jest|vitest|playwright|cypress/.test(relPath)
    || basename(relPath) === 'package.json'
    || basename(relPath) === 'turpan.yml'
    || /tsconfig|jest\.config|vitest\.config|webpack/.test(relPath);
}

function basename(relPath: string): string {
  return relPath.split('/').pop() ?? relPath;
}
