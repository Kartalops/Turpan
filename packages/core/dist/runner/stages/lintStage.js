/**
 * Lint Stage — runs detected lint commands safely.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createCommandEvidence, createEvidence } from '../../findings/Evidence.js';
import { SafeCommandRunner } from '../SafeCommandRunner.js';
export async function runLintStage(ctx, options = {}) {
    const start = Date.now();
    const findings = [];
    const { projectRoot, runId, fingerprint } = ctx;
    if (ctx.signal?.aborted) {
        return { stageId: 'lint', status: 'skipped', findings: [], durationMs: 0 };
    }
    if (options.skipLint) {
        return { stageId: 'lint', status: 'skipped', findings: [], durationMs: 0, artifacts: { skipped: true } };
    }
    const runner = new SafeCommandRunner({ projectRoot, runId });
    const lintCommands = fingerprint.lintCommands.length > 0
        ? fingerprint.lintCommands
        : ['lint'];
    const packageScripts = fingerprint.packageScripts;
    for (const cmdName of lintCommands) {
        if (ctx.signal?.aborted)
            break;
        const scriptContent = packageScripts[cmdName];
        if (!scriptContent)
            continue;
        let result;
        try {
            result = await runner.run(`npm run ${cmdName}`, {
                cwd: projectRoot,
                timeoutMs: options.timeoutMs ?? 60_000,
                saveLog: true,
                stageName: `lint-${cmdName}`,
                signal: ctx.signal,
            });
        }
        catch (err) {
            findings.push(createFinding({
                title: `Lint command '${cmdName}' threw an error`,
                explanation: err instanceof Error ? err.message : String(err),
                category: 'lint',
                severity: 'medium',
                confidence: confidence(80),
                fixable: 'manual',
                tags: ['lint', 'error'],
                evidence: [
                    createEvidence('command-log', {
                        command: `npm run ${cmdName}`,
                        label: 'lint-error',
                        excerpt: String(err),
                    }),
                ],
            }));
            continue;
        }
        if (result.blocked) {
            findings.push(createFinding({
                title: `Lint script '${cmdName}' was blocked by policy`,
                explanation: `The lint command was blocked: ${result.blockReason}`,
                category: 'security',
                severity: 'high',
                confidence: confidence(95),
                fixable: 'manual',
                tags: ['lint', 'blocked', 'policy'],
                evidence: [
                    createCommandEvidence(`npm run ${cmdName}`, result.blockReason ?? '', -1, { label: 'blocked-lint' }),
                ],
            }));
            continue;
        }
        if (result.timedOut) {
            findings.push(createFinding({
                title: `Lint script '${cmdName}' timed out`,
                explanation: `The lint command exceeded the timeout and was killed.`,
                category: 'lint',
                severity: 'medium',
                confidence: confidence(90),
                fixable: 'manual',
                tags: ['lint', 'timeout'],
                evidence: [
                    createCommandEvidence(`npm run ${cmdName}`, `Timed out after ${result.durationMs}ms\n${result.stdout}`, -1, { label: 'lint-timeout' }),
                ],
            }));
            continue;
        }
        if (result.exitCode !== 0) {
            findings.push(createFinding({
                title: `Lint script '${cmdName}' found issues (exit code ${result.exitCode})`,
                explanation: `The linter reported issues. Review the output for details — ` +
                    `these are style, quality, or potential bug findings.`,
                category: 'lint',
                severity: 'medium',
                confidence: confidence(90),
                fixable: 'auto',
                suggestedFix: `Fix lint issues manually or run with auto-fix: npm run ${cmdName} -- --fix`,
                tags: ['lint', 'failure'],
                evidence: [
                    createCommandEvidence(`npm run ${cmdName}`, result.stdout || result.stderr || '(no output)', result.exitCode ?? -1, { label: 'lint-output', exitCode: result.exitCode ?? undefined }),
                    result.logPath
                        ? createEvidence('file', {
                            path: result.logPath,
                            label: 'lint-log',
                            excerpt: `Full lint log saved to: ${result.logPath}`,
                        })
                        : {},
                ].filter(Boolean),
            }));
        }
    }
    return {
        stageId: 'lint',
        status: findings.some(f => f.severity === 'critical') ? 'failed' : 'completed',
        findings,
        durationMs: Date.now() - start,
    };
}
//# sourceMappingURL=lintStage.js.map