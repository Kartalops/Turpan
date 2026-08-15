/**
 * Install Check Stage
 *
 * Does NOT auto-install dependencies unless explicitly requested.
 * Reports if node_modules is missing (requires install).
 * Runs install command only if --install CLI flag is set or config.autoInstall is true.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence, createCommandEvidence } from '../../findings/Evidence.js';
import { SafeCommandRunner } from '../SafeCommandRunner.js';
import { detectPackageManager } from '../../project/detectPackageManager.js';
export async function runInstallCheck(ctx, options = {}) {
    const start = Date.now();
    const findings = [];
    const { projectRoot, runId } = ctx;
    const runner = new SafeCommandRunner({
        projectRoot,
        runId,
    });
    const nodeModulesPath = join(projectRoot, 'node_modules');
    const hasNodeModules = existsSync(nodeModulesPath);
    const { packageManager } = detectPackageManager(projectRoot);
    // ── Case 1: node_modules exists — nothing to do ────────────────────────────
    if (hasNodeModules && !options.force) {
        return {
            stageId: 'install-check',
            status: 'completed',
            findings: [],
            durationMs: Date.now() - start,
            artifacts: {
                hasNodeModules: true,
                packageManager,
                message: 'node_modules exists — no install needed',
            },
        };
    }
    // ── Case 2: node_modules missing — report requirement ───────────────────────
    if (!hasNodeModules && !options.installCommand) {
        const finding = createFinding({
            title: 'node_modules dependencies missing — build review requires install',
            explanation: `The node_modules directory is missing. Turpan cannot run build, test, lint, or typecheck ` +
                `without first installing dependencies. Run your package manager install command before re-running ` +
                `the review, or pass the --install flag to have Turpan install automatically (if configured).`,
            category: 'build',
            severity: 'info',
            confidence: confidence(95),
            fixable: 'manual',
            suggestedFix: `Run: ${packageManager === 'pnpm' ? 'pnpm install' : packageManager === 'yarn' ? 'yarn install' : packageManager === 'bun' ? 'bun install' : 'npm install'}`,
            tags: ['install', 'setup', 'node_modules'],
            evidence: [
                createEvidence('file', {
                    label: 'Missing node_modules',
                    path: nodeModulesPath,
                    excerpt: 'Directory not found — node_modules is missing',
                    metadata: { packageManager, required: true },
                }),
            ],
        });
        findings.push(finding);
        return {
            stageId: 'install-check',
            status: 'completed',
            findings,
            durationMs: Date.now() - start,
            artifacts: { hasNodeModules: false, packageManager, installRequired: true },
        };
    }
    // ── Case 3: Install command explicitly provided or --install flag ────────────
    const installCmd = options.installCommand ?? getInstallCommand(packageManager);
    findings.push(createFinding({
        id: 'install-check-started',
        title: 'Installing dependencies',
        explanation: `Running install command: ${installCmd}`,
        category: 'build',
        severity: 'info',
        confidence: confidence(99),
        fixable: 'none',
        tags: ['install', 'setup'],
        evidence: [
            createEvidence('command-log', {
                command: installCmd,
                label: 'install-command',
                excerpt: `Starting: ${installCmd}`,
                metadata: { packageManager, autoStarted: true },
            }),
        ],
    }));
    let installResult;
    try {
        installResult = await runner.run(installCmd, {
            cwd: projectRoot,
            timeoutMs: 300_000, // 5 min for install
            saveLog: true,
            stageName: 'install',
        });
    }
    catch (err) {
        return {
            stageId: 'install-check',
            status: 'failed',
            findings,
            durationMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    if (installResult.blocked) {
        findings.push(createFinding({
            title: 'Install command was blocked by policy',
            explanation: `The install command "${installResult.command}" was blocked: ${installResult.blockReason}`,
            category: 'security',
            severity: 'high',
            confidence: confidence(99),
            fixable: 'manual',
            suggestedFix: `Install dependencies manually: ${installCmd}`,
            tags: ['install', 'blocked', 'policy'],
            evidence: [
                createCommandEvidence(installResult.command, installResult.stdout + '\n' + installResult.stderr, installResult.exitCode ?? -1, { label: 'blocked-install', exitCode: installResult.exitCode ?? undefined }),
            ],
        }));
        return {
            stageId: 'install-check',
            status: 'completed',
            findings,
            durationMs: Date.now() - start,
            artifacts: { installBlocked: true },
        };
    }
    if (installResult.exitCode !== 0) {
        const finding = createFinding({
            title: 'Dependency installation failed',
            explanation: `The install command exited with code ${installResult.exitCode}. Build, test, and lint stages may fail without dependencies.`,
            category: 'build',
            severity: 'high',
            confidence: confidence(90),
            fixable: 'manual',
            suggestedFix: `Fix the error and re-run: ${installCmd}`,
            tags: ['install', 'failure'],
            evidence: [
                createCommandEvidence(installCmd, installResult.stdout, installResult.exitCode ?? -1, { label: 'install-output', exitCode: installResult.exitCode ?? undefined }),
                createEvidence('command-log', {
                    command: installCmd,
                    label: 'install-stderr',
                    excerpt: installResult.stderr || '(no stderr)',
                    exitCode: installResult.exitCode ?? undefined,
                }),
            ],
        });
        findings.push(finding);
    }
    return {
        stageId: 'install-check',
        status: installResult.exitCode === 0 ? 'completed' : 'failed',
        findings,
        durationMs: Date.now() - start,
        artifacts: {
            installExitCode: installResult.exitCode,
            logPath: installResult.logPath,
        },
    };
}
function getInstallCommand(packageManager) {
    switch (packageManager) {
        case 'pnpm': return 'pnpm install';
        case 'yarn': return 'yarn install';
        case 'bun': return 'bun install';
        default: return 'npm install';
    }
}
//# sourceMappingURL=installCheck.js.map