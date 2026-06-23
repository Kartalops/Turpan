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
import { walkFiles } from '../../../shared/index.js';
import { confidence, createFinding } from '../../../findings/Finding.js';
import { createEvidence } from '../../../findings/Evidence.js';
// ── Manifest ──────────────────────────────────────────────────────────────────
const manifest = {
    id: 'security-basic',
    name: 'Security Basic',
    version: '0.1.0',
    description: 'Shared security rules: secret detection, SQL injection, XSS, insecure dependencies',
    dependsOn: [],
};
// ── Plugin ─────────────────────────────────────────────────────────────────────
export const securityBasicPlugin = {
    manifest,
    supports() {
        return true; // Always applicable
    },
    register(registry, _ctx) {
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
function matchAndRedact(line, pattern) {
    const m = line.match(pattern);
    if (!m)
        return { matched: false, excerpt: '' };
    // Build a redacted excerpt — replace the matched portion with [REDACTED]
    const excerpt = line.length > 200
        ? line.slice(0, 80) + '...[REDACTED]...' + line.slice(line.length - 40)
        : line.replace(pattern, '[REDACTED]');
    return { matched: true, excerpt };
}
function createSecurityBasicAnalyzer() {
    return {
        id: 'security-basic',
        name: 'Security Basic Analyzer',
        categories: ['security'],
        supports() {
            return true;
        },
        async run(ctx) {
            const start = Date.now();
            const findings = [];
            const artifacts = {};
            try {
                const allFiles = walkFiles({
                    cwd: ctx.projectRoot,
                    extensions: ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rb', 'java'],
                    ignoreDirs: new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turpan']),
                    maxDepth: 8,
                });
                // ── Secret Detection (real content scanning) ────────────────────
                const SECRET_PATTERNS = [
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
                const secretHits = [];
                let scannedFiles = 0;
                for (const file of allFiles) {
                    // Limit scope: skip very large files
                    let content;
                    try {
                        content = readFileSync(file, 'utf-8');
                    }
                    catch {
                        continue;
                    }
                    if (content.length > 200_000)
                        continue;
                    scannedFiles++;
                    const lines = content.split(/\r?\n/);
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        // Skip comments-only lines and obvious test fixtures
                        if (/^\s*(#|\/\/|\/\*|\*)/.test(line))
                            continue;
                        // Skip the project's own "examples" or test files that intentionally contain fake secrets
                        if (/\b(EXAMPLE|SAMPLE|TEST|FAKE|DUMMY|PLACEHOLDER|__tests__|\.test\.)\b/i.test(file))
                            continue;
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
                    const byFile = new Map();
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
                            title: `Hardcoded ${hits[0].pattern} in ${relativePath}`,
                            explanation: `Found ${hits.length} hardcoded secret pattern(s) in ${relativePath}. ` +
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
                const sqlFindings = [];
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
                    let content;
                    try {
                        content = readFileSync(file, 'utf-8');
                    }
                    catch {
                        continue;
                    }
                    if (content.length > 200_000)
                        continue;
                    const lines = content.split(/\r?\n/);
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (/^\s*(#|\/\/|\/\*|\*)/.test(line))
                            continue;
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
                        explanation: `Found ${sqlFindings.length} instance(s) of SQL queries built by concatenating or ` +
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
                const xssFindings = [];
                const XSS_PATTERNS = [
                    /\b\.innerHTML\s*=/i,
                    /\bdangerouslySetInnerHTML\b/i,
                    /\bdocument\.write\s*\(/i,
                    /\beval\s*\(/i,
                ];
                for (const file of allFiles) {
                    if (!/\.(ts|tsx|js|jsx)$/.test(file))
                        continue;
                    let content;
                    try {
                        content = readFileSync(file, 'utf-8');
                    }
                    catch {
                        continue;
                    }
                    if (content.length > 200_000)
                        continue;
                    const lines = content.split(/\r?\n/);
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (/^\s*(\/\/|\/\*|\*)/.test(line))
                            continue;
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
                        explanation: `Found ${xssFindings.length} instance(s) of innerHTML, dangerouslySetInnerHTML, ` +
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
            }
            catch (err) {
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
//# sourceMappingURL=SecurityBasicPlugin.js.map