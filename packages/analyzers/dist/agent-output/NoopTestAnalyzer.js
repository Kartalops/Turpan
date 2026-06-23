/**
 * NoopTestAnalyzer — detects tests that don't actually test anything
 *
 * Finds tests that:
 * - Only check truthy values (expect(true).toBe(true))
 * - Only render a component without assertions
 * - Are skipped (test.skip / describe.skip)
 * - Mock everything meaningful
 * - Have no actual assertions
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
const NOOP_PATTERNS = [
    // Only truthy check
    {
        pattern: /expect\s*\(\s*\w+\s*\)\s*\.\s*(toBeTruthy|toBe\s*\(\s*true\s*\)|toEqual\s*\(\s*true\s*\)|toStrictEqual\s*\(\s*true\s*\))/,
        label: 'Test only checks truthy value — no real assertion',
        explanation: 'This test evaluates only whether a value is truthy, without checking actual behavior, return values, side effects, or state changes. A meaningful test would verify specific output or behavior.',
        severity: 'medium',
        confidence: 75,
    },
    // expect(true).toBe(true) or equivalent
    {
        pattern: /expect\s*\(\s*true\s*\)\s*\.\s*(toBe|toEqual|toStrictEqual)\s*\(\s*true\s*\)/,
        label: 'Test asserts true === true — test is always passing',
        explanation: 'This test always passes regardless of the code. It provides zero validation that the feature works.',
        severity: 'high',
        confidence: 90,
    },
    // expect(false).toBe(false)
    {
        pattern: /expect\s*\(\s*false\s*\)\s*\.\s*(toBe|toEqual|toStrictEqual)\s*\(\s*false\s*\)/,
        label: 'Test asserts false === false — always passing, no real check',
        explanation: 'This test always passes. It provides zero validation.',
        severity: 'high',
        confidence: 90,
    },
    // Only console.log in test
    {
        pattern: /(?:test|it|describe)\s*\([^)]*\)\s*[,{]\s*}\s*\)\s*=>\s*[{]\s*(?:const|let|var)?\s*\w+\s*;?\s*console\.(log|debug)\(/,
        label: 'Test body only logs — no assertion',
        explanation: 'This test executes code but produces no assertions. A test must verify behavior, not just log it.',
        severity: 'medium',
        confidence: 80,
    },
    // Skipped test that mentions important feature
    {
        pattern: /(?:test\.|it\.)?skip\s*\(|describe\.skip\s*\(/,
        label: 'Test is skipped',
        explanation: 'This test is currently skipped. Skipped tests should either be re-enabled or removed if the feature is not planned.',
        severity: 'low',
        confidence: 90,
    },
    // Mocked everything meaningful
    {
        pattern: /(?:jest\.mock|vi\.mock|beforeEach.*mock|afterEach.*mock).*(?:ai|openai|anthropic|stripe|sendgrid|database|db)/i,
        label: 'Test mocks the core functionality — test validates mock setup, not real behavior',
        explanation: 'When a test mocks the core external integration (AI, Stripe, database), it is testing that the mock was called, not that the real service works. For critical integrations, add at least one integration test with a sandbox/test API key.',
        severity: 'medium',
        confidence: 70,
    },
    // Empty test body
    {
        pattern: /(?:test|it|specify)\s*\([^)]*\)[^{]*[{]\s*[}]/,
        label: 'Test body is empty',
        explanation: 'This test has no implementation. It will always pass but validates nothing.',
        severity: 'high',
        confidence: 90,
    },
    // Only renders component without assertion
    {
        pattern: /render\(.+?\)\s*;/,
        label: 'Component rendered but no assertions made',
        explanation: 'The component is rendered but no assertion checks that it actually displays the right content, handles props correctly, or responds to interaction.',
        severity: 'medium',
        confidence: 65,
    },
    // Test with only try/catch and no assertion in catch
    {
        pattern: /try\s*[{][\s\S]{0,200}?catch\s*\([^)]*\)\s*[{][\s\S]{0,50}?[}][\s\S]{0,50}?expect/,
        label: 'Test has try/catch but may be swallowing errors',
        explanation: 'Test uses try/catch but may not assert on the caught error, potentially hiding real failures.',
        severity: 'medium',
        confidence: 60,
    },
];
export function analyzeNoopTests(opts) {
    const { testFiles } = opts;
    const issues = [];
    for (const file of testFiles) {
        let content = '';
        try {
            content = readFileSync(file, 'utf-8');
        }
        catch {
            continue;
        }
        const lines = content.split('\n');
        for (const { pattern, label, explanation, severity, confidence } of NOOP_PATTERNS) {
            const match = pattern.exec(content);
            if (!match)
                continue;
            // Find line number
            let lineNo = 1;
            let charIndex = match.index;
            for (const line of lines) {
                if (charIndex <= line.length)
                    break;
                charIndex -= line.length + 1;
                lineNo++;
            }
            // Context — surrounding lines
            const startLine = Math.max(0, lineNo - 3);
            const endLine = Math.min(lines.length, lineNo + 3);
            const excerpt = lines.slice(startLine, endLine).join('\n');
            issues.push({
                kind: 'noop-test',
                severity,
                title: `[TEST] ${label}`,
                explanation: `In ${file} line ${lineNo}: ${explanation}`,
                file,
                line: lineNo,
                suggestedFix: `Add meaningful assertions that verify actual behavior. For UI tests: check rendered content. For API tests: verify response body and status code. For integration tests: use real sandboxes or test environments instead of mocking everything.`,
                confidence,
                evidence: [
                    {
                        type: 'test',
                        path: file,
                        line: lineNo,
                        excerpt: excerpt.slice(0, 300),
                    },
                ],
            });
        }
    }
    return issues;
}
/**
 * Find test files in a project
 */
export function findTestFiles(projectRoot, extensions = ['ts', 'tsx', 'js', 'jsx']) {
    const tests = [];
    function walk(dir, depth = 0) {
        if (depth > 5)
            return;
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build' || entry.name === 'coverage')
                    continue;
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath, depth + 1);
                }
                else if (entry.isFile()) {
                    const ext = entry.name.split('.').pop()?.toLowerCase();
                    if (!extensions.includes(ext ?? ''))
                        continue;
                    if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name) || /__tests?__/.test(entry.name)) {
                        tests.push(fullPath);
                    }
                }
            }
        }
        catch {
            // skip
        }
    }
    walk(projectRoot);
    return tests;
}
//# sourceMappingURL=NoopTestAnalyzer.js.map