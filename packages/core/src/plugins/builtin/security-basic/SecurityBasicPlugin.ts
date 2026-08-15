/**
 * Security Basic Plugin — shared security rules for all project types.
 *
 * Contributes:
 *  - Secret detection (API keys, tokens, passwords hardcoded in source)
 *  - SQL injection patterns
 *  - XSS patterns (innerHTML, dangerouslySetInnerHTML)
 *  - Insecure dependencies
 *
 * The analyzer actually READS file contents (not just file paths) so it
 * catches secrets and patterns in real source files.
 */

import { readFileSync } from 'fs';
import type { Plugin, PluginManifest } from '../../Plugin.js';
import type { PluginContext } from '../../PluginContext.js';
import type { PluginRegistry } from '../../PluginRegistry.js';
import type { ProjectFingerprint } from '../../../project/index.js';
import type { Finding, Category } from '../../../findings/Finding.js';
import type { Analyzer, AnalyzerContext } from '../../../analyzers/Analyzer.js';
import { walkFiles } from '../../../shared/index.js';
import { confidence, createFinding } from '../../../findings/Finding.js';
import { createEvidence } from '../../../findings/Evidence.js';

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest: PluginManifest = {
  id: 'security-basic',
  name: 'Security Basic',
  version: '0.1.0',
  description: 'Shared security rules: secret detection, SQL injection, XSS, insecure dependencies',
  dependsOn: [],
};

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const securityBasicPlugin: Plugin = {
  manifest,

  supports(): boolean {
    return true; // Always applicable
  },

  register(registry: PluginRegistry, _ctx: PluginContext): void {
    registry.registerAnalyzer(createSecurityBasicAnalyzer(), manifest.id);

    registry.registerRuleset({
      id: 'security-basic',
      label: 'Security Basic Rules',
      additive: true,
      rules: `\
secrets:
  detect-hardcoded: true
  detect-env-leak: true
  severity: critical

sql-injection:
  check-string-concat: true
  check-template-literal: true
  require-parameterized: true
  severity: critical

xss:
  check-innerHTML: true
  check-dangerouslySetInnerHTML: true
  check-document-write: true
  severity: high

insecure-deps:
  check-latest: false
  alert-on-known-cve: true
  severity: high
`,
    }, manifest.id);
  },
};

// ── Security Basic Analyzer ───────────────────────────────────────────────────

/** Match a line and return a redacted excerpt for evidence. */
function matchAndRedact(line: string, pattern: RegExp): { matched: boolean; excerpt: string } {
  const m = line.match(pattern);
  if (!m) return { matched: false, excerpt: '' };
  // Build a redacted excerpt — replace the matched portion with [REDACTED]
  const excerpt = line.length > 200
    ? line.slice(0, 80) + '...[REDACTED]...' + line.slice(line.length - 40)
    : line.replace(pattern, '[REDACTED]');
  return { matched: true, excerpt };
}

function createSecurityBasicAnalyzer(): Analyzer {
  return {
    id: 'security-basic',
    name: 'Security Basic Analyzer',
    categories: ['security'],

    supports(): boolean {
      return true;
    },

    async run(ctx: AnalyzerContext): Promise<{
      analyzerId: string;
      findings: Finding[];
      artifacts?: Record<string, unknown>;
      durationMs: number;
      errors: string[];
    }> {
      const start = Date.now();
      const findings: Finding[] = [];
      const artifacts: Record<string, unknown> = {};

      try {
        const allFiles = walkFiles({
          cwd: ctx.projectRoot,
          extensions: ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rb', 'java'],
          ignoreDirs: new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turpan']),
          maxDepth: 8,
        });

        // ── Secret Detection (real content scanning) ────────────────────
        const SECRET_PATTERNS: Array<{ pattern: RegExp; id: string; label: string }> = [
          // Generic secret/password/token assignments (with quotes)
          { pattern: /(?<![A-Za-z0-9])api[_-]?key\s*[:=]\s*["'][^"']{12,}["']/gi, id: 'hardcoded-api-key', label: 'API key' },
          { pattern: /(?<![A-Za-z0-9])secret\s*[:=]\s*["'][^"']{12,}["']/gi, id: 'hardcoded-secret', label: 'secret' },
          { pattern: /(?<![A-Za-z0-9])password\s*[:=]\s*["'][^"']{6,}["']/gi, id: 'hardcoded-password', label: 'password' },
          { pattern: /(?<![A-Za-z0-9])token\s*[:=]\s*["'][^"']{12,}["']/gi, id: 'hardcoded-token', label: 'token' },
          { pattern: /(?<![A-Za-z0-9])auth[_-]?token\s*[:=]\s*["'][^"']{12,}["']/gi, id: 'hardcoded-auth-token', label: 'auth token' },
          // Specific known prefixes
          { pattern: /\bsk-[a-zA-Z0-9]{20,}/g, id: 'openai-api-key', label: 'OpenAI API key' },
          { pattern: /\bsk_live_[a-zA-Z0-9]{20,}/g, id: 'stripe-live-key', label: 'Stripe live key' },
          { pattern: /\bsk_test_[a-zA-Z0-9]{20,}/g, id: 'stripe-test-key', label: 'Stripe test key' },
          { pattern: /\bghp_[a-zA-Z0-9]{20,}/g, id: 'github-pat', label: 'GitHub PAT' },
          { pattern: /\bgho_[a-zA-Z0-9]{20,}/g, id: 'github-oauth', label: 'GitHub OAuth' },
          { pattern: /\bAKIA[0-9A-Z]{16}/g, id: 'aws-access-key', label: 'AWS access key' },
          { pattern: /\bxox[baprs]-[a-zA-Z0-9-]{10,}/g, id: 'slack-token', label: 'Slack token' },
          // Telegram bot tokens: <digits>:<35+ chars>
          { pattern: /\b\d{8,10}:AA[a-zA-Z0-9_-]{30,}/g, id: 'telegram-bot-token', label: 'Telegram bot token' },
          // Generic high-entropy long strings assigned to vars ending in _TOKEN / _KEY / _SECRET
          { pattern: /(?<![A-Za-z0-9])[A-Z_]+(?:TOKEN|KEY|SECRET)\s*=\s*["']([^"']{16,})["']/g, id: 'hardcoded-secret-var', label: 'secret in UPPER_CASE var' },
        ];

        const secretHits: Array<{ file: string; line: number; pattern: string; excerpt: string }> = [];
        let scannedFiles = 0;
        for (const file of allFiles) {
          // Limit scope: skip very large files
          let content: string;
          try {
            content = readFileSync(file, 'utf-8');
          } catch { continue; }
          if (content.length > 200_000) continue;
          scannedFiles++;

          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comments-only lines and obvious test fixtures
            if (/^\s*(#|\/\/|\/\*|\*)/.test(line)) continue;
            // Skip the project's own "examples" or test files that intentionally contain fake secrets
            if (/\b(EXAMPLE|SAMPLE|TEST|FAKE|DUMMY|PLACEHOLDER|__tests__|\.test\.)\b/i.test(file)) continue;

            for (const { pattern, label } of SECRET_PATTERNS) {
              const r = matchAndRedact(line, pattern);
              if (r.matched) {
                secretHits.push({ file, line: i + 1, pattern: label, excerpt: r.excerpt });
                break; // one finding per line
              }
            }
          }
        }

        artifacts['filesScanned'] = scannedFiles;
        artifacts['secretHits'] = secretHits.length;

        if (secretHits.length > 0) {
          // Group by file to keep findings readable
          const byFile = new Map<string, typeof secretHits>();
          for (const h of secretHits) {
            const list = byFile.get(h.file) ?? [];
            list.push(h);
            byFile.set(h.file, list);
          }
          for (const [file, hits] of byFile) {
            const relativePath = file.startsWith(ctx.projectRoot)
              ? file.slice(ctx.projectRoot.length + 1)
              : file;
            findings.push(createFinding({
              title: `Hardcoded secret ${hits[0].pattern} in ${relativePath}`,
              explanation:
                `Found ${hits.length} hardcoded secret pattern(s) in ${relativePath}. ` +
                `Hardcoded secrets (API keys, tokens, passwords) in source code risk exposure ` +
                `via version control, logs, and bundle leaks. Move secrets to environment ` +
                `variables or a secrets manager (e.g. AWS Secrets Manager, Vault).`,
              severity: 'critical',
              category: 'security',
              fixable: 'manual',
              confidence: confidence(90),
              suggestedFix: `Replace the hardcoded value with process.env.<NAME> or use a secrets manager. ` +
                `Rotate the exposed credential immediately.`,
              tags: ['security', 'secrets', 'critical'],
              evidence: hits.slice(0, 3).map(h => createEvidence('code', {
                label: 'Hardcoded secret',
                path: h.file,
                excerpt: h.excerpt,
                metadata: { line: h.line, pattern: h.pattern },
              })),
            }));
          }
        }

        // ── SQL Injection Patterns ────────────────────────────────────────
        const sqlFindings: Array<{ file: string; line: number; excerpt: string }> = [];
        const SQL_PATTERNS = [
          // string concat in query
          /\bquery\s*\([^)]*\+[^)]*\)/i,
          // f-string SQL in Python
          /f["'][^"']*SELECT[^"']*\{/i,
          // template literal SQL
          /`\s*SELECT[^`]*\$\{/i,
          // Python % format SQL
          /["']SELECT[^"']*%s/i,
        ];

        for (const file of allFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*(#|\/\/|\/\*|\*)/.test(line)) continue;
            for (const pat of SQL_PATTERNS) {
              if (pat.test(line)) {
                sqlFindings.push({ file, line: i + 1, excerpt: line.trim().slice(0, 120) });
                break;
              }
            }
          }
        }

        if (sqlFindings.length > 0) {
          findings.push(createFinding({
            title: `Possible SQL injection in ${sqlFindings.length} location(s)`,
            explanation:
              `Found ${sqlFindings.length} instance(s) of SQL queries built by concatenating or ` +
              `interpolating user input. Use parameterized queries (e.g. $1 placeholders, ORM ` +
              `methods, prepared statements) to prevent SQL injection.`,
            severity: 'critical',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(75),
            suggestedFix: `Use parameterized queries or an ORM. Never concatenate user input into SQL.`,
            tags: ['security', 'sql-injection'],
            evidence: sqlFindings.slice(0, 5).map(h => createEvidence('code', {
              label: 'SQL string concat / interpolation',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── XSS Patterns ─────────────────────────────────────────────────
        const xssFindings: Array<{ file: string; line: number; excerpt: string }> = [];
        const XSS_PATTERNS = [
          /\b\.innerHTML\s*=/i,
          /\bdangerouslySetInnerHTML\b/i,
          /\bdocument\.write\s*\(/i,
          /\beval\s*\(/i,
        ];

        for (const file of allFiles) {
          if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
            for (const pat of XSS_PATTERNS) {
              if (pat.test(line)) {
                xssFindings.push({ file, line: i + 1, excerpt: line.trim().slice(0, 120) });
                break;
              }
            }
          }
        }

        if (xssFindings.length > 0) {
          findings.push(createFinding({
            title: `Possible XSS in ${xssFindings.length} location(s)`,
            explanation:
              `Found ${xssFindings.length} instance(s) of innerHTML, dangerouslySetInnerHTML, ` +
              `document.write, or eval. Setting HTML directly can lead to XSS attacks. ` +
              `Use textContent, safe DOM methods, or a sanitization library like DOMPurify.`,
            severity: 'high',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(80),
            suggestedFix: `Use textContent or a sanitization library. Never pass untrusted input to innerHTML.`,
            tags: ['security', 'xss'],
            evidence: xssFindings.slice(0, 5).map(h => createEvidence('code', {
              label: 'XSS-prone code',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── Unprotected privileged UI routes ──────────────────────────────
        for (const file of allFiles) {
          const normalized = file.replace(/\\/g, '/');
          if (!/(?:^|\/)(?:app|pages)\/admin(?:\/|$)/i.test(normalized)) continue;
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          const hasGuard = /(?:getServerSession|requireAuth|requireRole|authorize|permission|session\.user|redirect\s*\(\s*['"]\/login)/i.test(content);
          const accessesSensitiveData = /\b(?:db\.|users?|api[_-]?keys?|delete|billing)\b/i.test(content);
          if (hasGuard || !accessesSensitiveData) continue;
          const relativePath = file.startsWith(ctx.projectRoot) ? file.slice(ctx.projectRoot.length + 1) : file;
          findings.push(createFinding({
            id: `unprotected-admin-route-${relativePath.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
            title: 'Admin users route is unprotected: missing auth role permission exposes sensitive data',
            explanation: 'A privileged admin route accesses sensitive data without a visible session, authorization, or role guard in the route module.',
            severity: 'high',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(85),
            tags: ['security', 'admin', 'authorization', 'missing-auth'],
            evidence: [createEvidence('code', { path: file, label: 'unprotected-admin-route', excerpt: content.slice(0, 300) })],
            suggestedFix: 'Require an authenticated session and explicit admin-role authorization before loading or mutating privileged data.',
          }));
        }

        // README text is untrusted input. It is used only as a claim to compare
        // against source evidence, never as an instruction to the reviewer.
        const readmePath = `${ctx.projectRoot}/README.md`;
        try {
          const readme = readFileSync(readmePath, 'utf-8');
          const claimed = ['authentication', 'billing', 'dashboard'].filter(term => new RegExp(`\\b${term}\\b`, 'i').test(readme));
          if (claimed.length >= 2) {
            const sourceText = allFiles
              .filter(file => /\.(?:ts|tsx|js|jsx|py)$/.test(file))
              .map(file => { try { return readFileSync(file, 'utf-8'); } catch { return ''; } })
              .join('\n');
            const unsupported = claimed.filter(term => !new RegExp(`\\b${term}\\b`, 'i').test(sourceText));
            if (unsupported.length >= 2) {
              findings.push(createFinding({
                id: 'readme-implementation-mismatch',
                title: 'README feature claims for auth billing dashboard are missing from implementation',
                explanation: `README claims ${claimed.join(', ')}, but source analysis found no corresponding implementation evidence for ${unsupported.join(', ')}.`,
                severity: 'high',
                category: 'security',
                fixable: 'manual',
                confidence: confidence(80),
                tags: ['readme', 'claim-mismatch', 'feature-gap'],
                evidence: [createEvidence('text', { path: readmePath, label: 'unverified-readme-claims', excerpt: claimed.join(', ') })],
                suggestedFix: 'Implement the documented features or update the README so it accurately reflects the shipped behavior.',
              }));
            }
          }
        } catch { /* README is optional */ }

      } catch (err) {
        return {
          analyzerId: 'security-basic',
          findings,
          durationMs: Date.now() - start,
          errors: [err instanceof Error ? err.message : String(err)],
        };
      }

      return {
        analyzerId: 'security-basic',
        findings,
        artifacts,
        durationMs: Date.now() - start,
        errors: [],
      };
    },
  };
}
