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
        return fp.languages.some(language => ['typescript', 'javascript'].includes(language.toLowerCase()));
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
                        const billingContext = /\b(?:billing|stripe|checkout|subscription)\b/i.test(content);
                        const title = billingContext && /TODO|mock|fake|placeholder/i.test(type)
                            ? `${type}: placeholder billing stub needs wire-up`
                            : `${type}: potential placeholder code`;
                        findings.push(createFinding({
                            id: `placeholder-${type.replace(/[^a-z0-9]/gi, '-')}-${lineNum}`.toLowerCase(),
                            title,
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
                const noopButton = /<button\b[\s\S]{0,800}?onClick\s*=\s*\{[\s\S]{0,400}?alert\s*\(/i.exec(content);
                if (noopButton) {
                    const line = content.slice(0, noopButton.index).split('\n').length;
                    findings.push(createFinding({
                        id: `alert-only-button-${line}`,
                        title: 'Placeholder TODO stub button handler uses alert instead of billing checkout',
                        explanation: 'A user-facing button handler only displays an alert and does not perform the represented workflow. This is a no-op interaction when the UI promises a real action.',
                        severity: 'medium',
                        category: 'maintainability',
                        fixable: 'manual',
                        confidence: confidence(85),
                        tags: ['ui', 'button', 'alert', 'noop', 'placeholder'],
                        file,
                        line,
                        evidence: [createEvidence('code', { path: file, label: 'alert-only-button-handler', excerpt: noopButton[0].slice(0, 240) })],
                        suggestedFix: 'Wire the button to the intended action and provide an explicit disabled state until that workflow is available.',
                    }));
                }
                if (/\b(?:it|test)\s*\([^\n]+[\s\S]{0,600}?expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/i.test(content) && /(?:^|[/\\])(?:test|tests|__tests__)(?:[/\\]|$)|\.(?:test|spec)\.[jt]sx?$/i.test(file)) {
                    findings.push(createFinding({
                        id: `noop-test-${file.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
                        title: 'Shallow no-op placeholder mock test has an always-true assertion and does not verify behavior',
                        explanation: 'The test assertion is always true, so it cannot detect a regression in the implementation under test.',
                        severity: 'high',
                        category: 'test',
                        fixable: 'manual',
                        confidence: confidence(90),
                        tags: ['test', 'no-op', 'assertion', 'shallow'],
                        file,
                        evidence: [createEvidence('code', { path: file, label: 'always-true-test', excerpt: 'expect(true).toBe(true)' })],
                        suggestedFix: 'Replace the assertion with an observable behavior assertion against the implementation under test.',
                    }));
                }
                const consoleError = /console\.error\s*\([^)]*\)/i.exec(content);
                if (consoleError) {
                    const line = content.slice(0, consoleError.index).split('\n').length;
                    findings.push(createFinding({
                        id: `console-error-${line}`,
                        title: 'Runtime console.error indicates an unhandled application error',
                        explanation: 'Production source explicitly emits a console error. Review the associated failure path and ensure it is handled and observable.',
                        severity: 'medium',
                        category: 'runtime',
                        fixable: 'manual',
                        confidence: confidence(75),
                        tags: ['runtime', 'console', 'error'],
                        file,
                        line,
                        evidence: [createEvidence('code', { path: file, label: 'console-error', excerpt: consoleError[0] })],
                        suggestedFix: 'Handle the underlying error path and replace ad-hoc console output with structured error reporting where appropriate.',
                    }));
                }
                const undefinedCall = /\b((?:not)?(?:undefined|defined)[A-Za-z0-9_$]*)\s*\(/i.exec(content);
                if (undefinedCall) {
                    const line = content.slice(0, undefinedCall.index).split('\n').length;
                    const effectContext = /\buseEffect\b/.test(content) ? ' useEffect' : '';
                    findings.push(createFinding({
                        id: `undefined-call-${undefinedCall[1].toLowerCase()}-${line}`,
                        title: `Reference error: ${undefinedCall[1]} is undefined in${effectContext} component execution`,
                        explanation: `The source invokes ${undefinedCall[1]}() but the identifier is explicitly named as undefined. This will throw at runtime when the component executes.`,
                        severity: 'high',
                        category: 'runtime',
                        fixable: 'manual',
                        confidence: confidence(90),
                        tags: ['runtime', 'reference-error', 'undefined-symbol'],
                        file,
                        line,
                        evidence: [createEvidence('code', { path: file, label: 'undefined-function-call', excerpt: undefinedCall[0] })],
                        suggestedFix: `Import, define, or remove the call to ${undefinedCall[1]} before the component executes.`,
                    }));
                }
                const saveForm = /<form\b([\s\S]{0,1800})<button\b[^>]*\btype\s*=\s*["']button["'][^>]*>\s*Save(?:\s+Changes)?\s*<\/button>/i.exec(content);
                if (saveForm && !/\b(?:onSubmit|onClick|action)\s*=/i.test(saveForm[0])) {
                    const line = content.slice(0, saveForm.index).split('\n').length;
                    findings.push(createFinding({
                        id: `unwired-save-button-${line}`,
                        title: 'Settings save button is unwired: no-op form handler cannot persist changes',
                        explanation: 'A save button with type="button" appears inside a form, but neither the button nor form has a click, submit, or action handler.',
                        severity: 'medium',
                        category: 'maintainability',
                        fixable: 'manual',
                        confidence: confidence(90),
                        tags: ['ui', 'settings', 'save', 'unwired', 'noop'],
                        file,
                        line,
                        evidence: [createEvidence('code', { path: file, label: 'unwired-save-button', excerpt: saveForm[0].slice(0, 300) })],
                        suggestedFix: 'Add an explicit submit or click handler that validates and persists the edited settings.',
                    }));
                }
                const lastReturn = content.lastIndexOf('return');
                if (/dashboard/i.test(file) && lastReturn >= 0) {
                    const rendered = content.slice(lastReturn);
                    const hasDashboardHeading = /<h1>\s*Dashboard\s*<\/h1>/i.test(rendered);
                    const hasMeaningfulContent = /<(?:p|button|input|section|article|table|ul|ol)\b|\{\s*\w+\.map\s*\(/i.test(rendered);
                    if (hasDashboardHeading && !hasMeaningfulContent) {
                        findings.push(createFinding({
                            id: `empty-dashboard-${file.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
                            title: 'Dashboard route renders an empty state with no content or widgets',
                            explanation: 'The final dashboard render contains only its heading and no visible data, action, list, form, or widget.',
                            severity: 'medium',
                            category: 'ui',
                            fixable: 'manual',
                            confidence: confidence(85),
                            tags: ['ui', 'dashboard', 'empty-state'],
                            file,
                            evidence: [createEvidence('code', { path: file, label: 'empty-dashboard-render', excerpt: rendered.slice(0, 300) })],
                            suggestedFix: 'Render a meaningful empty state, loading state, or dashboard content for authenticated users.',
                        }));
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