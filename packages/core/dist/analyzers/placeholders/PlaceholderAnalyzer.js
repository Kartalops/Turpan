/**
 * Placeholder / Fake Implementation Analyzer
 * Detects placeholder code, TODOs treated as real code, fake implementations,
 * mock-only code, hardcoded success returns, and not-implemented patterns.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { walkFiles } from '../../shared/index.js';
const PATTERNS = [
    // Obvious placeholders
    { pattern: /TODO(?![\s\S]*?\b(hack|skip|temp|remove)\b)/i, type: 'TODO without follow-up', severity: 'low', confidence: 60 },
    { pattern: /FIXME(?![\s\S]*?\b(hack|skip|temp)\b)/i, type: 'FIXME without follow-up', severity: 'medium', confidence: 75 },
    { pattern: /\bplaceholder\b/i, type: 'Placeholder comment', severity: 'low', confidence: 65 },
    { pattern: /\bcoming soon\b/i, type: 'Coming soon', severity: 'low', confidence: 80 },
    { pattern: /\bnot implemented\b/i, type: 'Not implemented', severity: 'medium', confidence: 85 },
    { pattern: /\bunder construction\b/i, type: 'Under construction', severity: 'low', confidence: 80 },
    { pattern: /\bwip\b/i, type: 'Work in progress', severity: 'low', confidence: 60 },
    { pattern: /\bdemo only\b/i, type: 'Demo only', severity: 'medium', confidence: 85 },
    { pattern: /\bmock\b|\bfake\b/i, type: 'Mock/fake implementation', severity: 'low', confidence: 70 },
    // throw errors
    { pattern: /throw\s+new\s+Error\s*\(\s*['"](Not\s+implemented| TODO| placeholder|FIXME)['"]/i, type: 'Not implemented Error', severity: 'medium', confidence: 90 },
    { pattern: /throw\s+new\s+Error\s*\(\s*['"][^'"]*not\s+implemented[^'"]*['"]/i, type: 'Not implemented Error', severity: 'medium', confidence: 90 },
    // Hardcoded success / no-op returns
    { pattern: /return\s+true\s*;?\s*(?:\/\/|\/\*|\*).*?(?:mock|dummy|placeholder|test)/i, type: 'Hardcoded true for testing', severity: 'low', confidence: 80 },
    { pattern: /return\s+Promise\.resolve\s*\(\s*true\s*\)/i, type: 'Hardcoded resolved promise', severity: 'low', confidence: 75 },
    { pattern: /return\s+\{\s*\}\s*;?\s*(?:\/\/|\/\*|\*).*?(?:mock|dummy|placeholder)/i, type: 'Empty object return for mock', severity: 'low', confidence: 75 },
    // console-only implementations
    { pattern: /^\s*console\.(log|debug|info)\s*\([^)]+\)\s*;?\s*$/m, type: 'Console-only implementation', severity: 'low', confidence: 50 },
    { pattern: /^\s*console\.(log|debug|info)\s*\([^)]+\)\s*;\s*return\s+/m, type: 'Console-only then return', severity: 'low', confidence: 65 },
    // Agent-like output detection
    { pattern: /\b(agent[-_\s]?output|ai[-_\s]?generated|gpt[-_\s]?output|llm[-_\s]?output)\b/i, type: 'Agent output marker', severity: 'info', confidence: 80 },
    { pattern: /\/\/\s*Generated\s+by\s+(?:AI|Claude|GPT|Copilot)/i, type: 'AI-generated code marker', severity: 'info', confidence: 75 },
    { pattern: /\/\/\s*Code\s+reviewed\s+by\s+(?:AI|Claude)/i, type: 'AI-reviewed code marker', severity: 'info', confidence: 75 },
];
export class PlaceholderAnalyzer {
    id = 'placeholder-implementation';
    name = 'Placeholder / Fake Implementation Analyzer';
    categories = ['agent-output', 'maintainability'];
    supports(fp) {
        return fp.languages.includes('typescript') || fp.languages.includes('javascript');
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        const files = await this.findSourceFiles(ctx.projectRoot);
        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                const lines = content.split('\n');
                for (const { pattern, type, severity, confidence: conf } of PATTERNS) {
                    let match;
                    pattern.lastIndex = 0; // reset regex state
                    while ((match = pattern.exec(content)) !== null) {
                        // Find line number
                        const lineNum = content.substring(0, match.index).split('\n').length;
                        findings.push(createFinding({
                            id: `placeholder-${type.replace(/[^a-z0-9]/gi, '-')}-${lineNum}`.toLowerCase(),
                            title: `${type}: potential placeholder code`,
                            explanation: `Found "${match[0].trim()}" in this file. This may indicate placeholder, incomplete, or fake implementation.`,
                            severity: severity,
                            category: conf >= 80 ? 'agent-output' : 'maintainability',
                            fixable: 'manual',
                            confidence: confidence(conf),
                            tags: ['placeholder', 'fake-implementation', type.toLowerCase().replace(/\s+/g, '-')],
                            file,
                            line: lineNum,
                            evidence: [
                                createEvidence('code', {
                                    path: file,
                                    label: 'placeholder-match',
                                    excerpt: `Line ${lineNum}: ${match[0].trim().substring(0, 120)}`,
                                }),
                            ],
                            suggestedFix: `Review this code. If it is a placeholder, either implement it properly or remove it. If it is intentional (e.g., a stub for testing), add a clear comment explaining why.`,
                        }));
                        // Only report first match per pattern per file to avoid spam
                        break;
                    }
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        return { analyzerId: this.id, findings, durationMs: 0, errors };
    }
    async findSourceFiles(projectRoot) {
        const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan']);
        return walkFiles({
            cwd: projectRoot,
            extensions: ['ts', 'tsx', 'js', 'jsx'],
            ignoreDirs: ignoredDirs,
        });
    }
}
//# sourceMappingURL=PlaceholderAnalyzer.js.map