/**
 * Script Detection Stage
 *
 * Validates that detected scripts actually exist in package.json
 * and checks for suspicious/missing scripts.
 */
import { readJsonFile } from '@turpan/shared';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { validateScript } from '../CommandPolicy.js';
export async function runScriptDetection(ctx) {
    const start = Date.now();
    const findings = [];
    const { projectRoot } = ctx;
    const pkg = readJsonFile(`${projectRoot}/package.json`);
    const scripts = pkg?.scripts ?? {};
    // ── Check for missing build script ────────────────────────────────────────
    const hasBuild = 'build' in scripts;
    if (!hasBuild && Object.keys(scripts).length > 0) {
        findings.push(createFinding({
            title: 'Missing build script in package.json',
            explanation: 'No `build` script was detected in package.json. ' +
                'The build stage may fail or be skipped.',
            category: 'build',
            severity: 'medium',
            confidence: confidence(80),
            fixable: 'manual',
            suggestedFix: 'Add a "build" script to package.json, e.g. "build": "tsc" or "build": "vite build"',
            tags: ['scripts', 'missing-build'],
            evidence: [
                createEvidence('file', {
                    path: `${projectRoot}/package.json`,
                    label: 'package.json',
                    excerpt: JSON.stringify(scripts, null, 2),
                    metadata: { scriptCount: Object.keys(scripts).length },
                }),
            ],
        }));
    }
    // ── Check for missing test script ─────────────────────────────────────────
    const hasTest = 'test' in scripts;
    if (!hasTest && Object.keys(scripts).length > 0) {
        findings.push(createFinding({
            title: 'Missing test script in package.json',
            explanation: 'No `test` script was detected in package.json. ' +
                'The test stage will be skipped without a test command.',
            category: 'test',
            severity: 'medium',
            confidence: confidence(80),
            fixable: 'manual',
            suggestedFix: 'Add a "test" script to package.json, e.g. "test": "vitest" or "test": "jest"',
            tags: ['scripts', 'missing-test'],
            evidence: [
                createEvidence('file', {
                    path: `${projectRoot}/package.json`,
                    label: 'package.json',
                    excerpt: JSON.stringify(scripts, null, 2),
                    metadata: { scriptCount: Object.keys(scripts).length },
                }),
            ],
        }));
    }
    // ── Validate each detected script for policy violations ──────────────────
    for (const [name, content] of Object.entries(scripts)) {
        const validation = validateScript(name, content);
        if (!validation.allowed) {
            findings.push(createFinding({
                title: `Script '${name}' is blocked by policy`,
                explanation: validation.reason ?? `Script '${name}' was blocked: ${content}`,
                category: 'security',
                severity: validation.severity ?? 'high',
                confidence: confidence(95),
                fixable: 'manual',
                suggestedFix: `Fix or remove the dangerous pattern in the '${name}' script: ${content}`,
                tags: ['scripts', 'blocked', 'policy'],
                evidence: [
                    createEvidence('command-log', {
                        command: `package.json scripts.${name}`,
                        label: 'blocked-script',
                        excerpt: `${name}: ${content}`,
                        metadata: {
                            scriptName: name,
                            scriptContent: content,
                            severity: validation.severity ?? 'unknown',
                        },
                    }),
                ],
            }));
        }
    }
    // ── Check for empty scripts ───────────────────────────────────────────────
    for (const [name, content] of Object.entries(scripts)) {
        if (!content || content.trim() === '') {
            findings.push(createFinding({
                title: `Script '${name}' is empty`,
                explanation: `Script '${name}' has an empty or whitespace-only value. It will do nothing when run.`,
                category: 'maintainability',
                severity: 'low',
                confidence: confidence(90),
                fixable: 'manual',
                suggestedFix: `Fill in the '${name}' script with a real command, or remove it.`,
                tags: ['scripts', 'empty'],
                evidence: [
                    createEvidence('file', {
                        path: `${projectRoot}/package.json`,
                        label: 'empty-script',
                        excerpt: `${name}: "${content}"`,
                    }),
                ],
            }));
        }
    }
    return {
        stageId: 'script-detection',
        status: 'completed',
        findings,
        durationMs: Date.now() - start,
        artifacts: {
            totalScripts: Object.keys(scripts).length,
            scriptNames: Object.keys(scripts),
        },
    };
}
//# sourceMappingURL=scriptDetection.js.map