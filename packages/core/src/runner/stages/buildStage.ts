/**
 * Build Stage — runs detected build commands safely.
 */

import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createCommandEvidence, createEvidence } from '../../findings/Evidence.js';
import { SafeCommandRunner } from '../SafeCommandRunner.js';
import type { CommandResult } from '../CommandResult.js';
import type { Finding } from '../../findings/Finding.js';

export async function runBuildStage(
  ctx: ReviewContext,
  options: { timeoutMs?: number; skipBuild?: boolean } = {}
): Promise<StageResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const { projectRoot, runId, fingerprint } = ctx;

  if (ctx.signal?.aborted) {
    return { stageId: 'build', status: 'skipped', findings: [], durationMs: 0 };
  }
  if (options.skipBuild) {
    return { stageId: 'build', status: 'skipped', findings: [], durationMs: 0, artifacts: { skipped: true } };
  }

  const runner = new SafeCommandRunner({ projectRoot, runId });

  // Use first detected build command, or try common defaults
  const buildCommands = fingerprint.buildCommands.length > 0
    ? fingerprint.buildCommands
    : ['build'];

  const packageScripts = fingerprint.packageScripts;

  for (const cmdName of buildCommands) {
    if (ctx.signal?.aborted) break;

    const scriptContent = packageScripts[cmdName];
    if (!scriptContent) continue; // skip if not found

    let result: CommandResult;
    try {
      result = await runner.run(`npm run ${cmdName}`, {
        cwd: projectRoot,
        timeoutMs: options.timeoutMs ?? 120_000,
        saveLog: true,
        stageName: `build-${cmdName}`,
        signal: ctx.signal,
      });
    } catch (err) {
      findings.push(
        createFinding({
          title: `Build command '${cmdName}' threw an error`,
          explanation: err instanceof Error ? err.message : String(err),
          category: 'build',
          severity: 'critical',
          confidence: confidence(80),
          fixable: 'manual',
          tags: ['build', 'error'],
          evidence: [
            createEvidence('command-log', {
              command: `npm run ${cmdName}`,
              label: 'build-error',
              excerpt: String(err),
            }),
          ],
        })
      );
      continue;
    }

    if (result.blocked) {
      findings.push(
        createFinding({
          title: `Build script '${cmdName}' was blocked by policy`,
          explanation: `The build command was blocked: ${result.blockReason}`,
          category: 'security',
          severity: 'high',
          confidence: confidence(95),
          fixable: 'manual',
          suggestedFix: `Fix the policy violation in the build script, or run the build command manually.`,
          tags: ['build', 'blocked', 'policy'],
          evidence: [
            createCommandEvidence(
              `npm run ${cmdName}`,
              result.blockReason ?? '',
              -1,
              { label: 'blocked-build' }
            ),
          ],
        })
      );
      continue;
    }

    if (result.timedOut) {
      findings.push(
        createFinding({
          title: `Build script '${cmdName}' timed out`,
          explanation: `The build command exceeded the timeout and was killed. The build process may be hanging or the timeout is too short.`,
          category: 'build',
          severity: 'high',
          confidence: confidence(90),
          fixable: 'manual',
          suggestedFix: `Increase the timeout if the build legitimately takes longer, or investigate why the build is hanging.`,
          tags: ['build', 'timeout'],
          evidence: [
            createCommandEvidence(
              `npm run ${cmdName}`,
              `Build timed out after ${result.durationMs}ms\n${result.stdout}`,
              -1,
              { label: 'build-timeout', exitCode: -1 }
            ),
          ],
        })
      );
      continue;
    }

    if (result.exitCode !== 0) {
      const errorExcerpt = result.stdout || result.stderr || '(no output)';
      findings.push(
        createFinding({
          title: `Build script '${cmdName}' failed with exit code ${result.exitCode}`,
          explanation:
            `The build command exited with a non-zero exit code. ` +
            `This typically means a compilation error, missing dependency, or configuration issue.`,
          category: 'build',
          severity: 'critical',
          confidence: confidence(90),
          fixable: 'manual',
          suggestedFix: `Run the build manually to see full error: npm run ${cmdName}`,
          tags: ['build', 'failure'],
          evidence: [
            createCommandEvidence(
              `npm run ${cmdName}`,
              errorExcerpt,
              result.exitCode ?? -1,
              { label: 'build-failure', exitCode: result.exitCode ?? undefined }
            ),
            result.logPath
              ? createEvidence('file', {
                  path: result.logPath,
                  label: 'build-log',
                  excerpt: `Full build log saved to: ${result.logPath}`,
                })
              : ({} as any),
          ].filter(Boolean),
        })
      );
    }
    // exitCode === 0 → success, no finding needed
  }

  return {
    stageId: 'build',
    status: findings.some(f => f.severity === 'critical') ? 'failed' : 'completed',
    findings,
    durationMs: Date.now() - start,
  };
}
