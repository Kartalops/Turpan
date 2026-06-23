/**
 * Test Stage — runs detected test commands safely.
 */

import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createCommandEvidence, createEvidence } from '../../findings/Evidence.js';
import { SafeCommandRunner } from '../SafeCommandRunner.js';
import type { CommandResult } from '../CommandResult.js';
import type { Finding } from '../../findings/Finding.js';

export async function runTestStage(
  ctx: ReviewContext,
  options: { timeoutMs?: number; skipTests?: boolean } = {}
): Promise<StageResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const { projectRoot, runId, fingerprint } = ctx;

  if (ctx.signal?.aborted) {
    return { stageId: 'test', status: 'skipped', findings: [], durationMs: 0 };
  }
  if (options.skipTests) {
    return { stageId: 'test', status: 'skipped', findings: [], durationMs: 0, artifacts: { skipped: true } };
  }

  const runner = new SafeCommandRunner({ projectRoot, runId });

  const testCommands = fingerprint.testCommands.length > 0
    ? fingerprint.testCommands
    : ['test'];
  const packageScripts = fingerprint.packageScripts;

  for (const cmdName of testCommands) {
    if (ctx.signal?.aborted) break;

    const scriptContent = packageScripts[cmdName];
    if (!scriptContent) continue;

    let result: CommandResult;
    try {
      result = await runner.run(`npm run ${cmdName}`, {
        cwd: projectRoot,
        timeoutMs: options.timeoutMs ?? 300_000, // 5 min default for tests
        saveLog: true,
        stageName: `test-${cmdName}`,
        signal: ctx.signal,
      });
    } catch (err) {
      findings.push(
        createFinding({
          title: `Test command '${cmdName}' threw an error`,
          explanation: err instanceof Error ? err.message : String(err),
          category: 'test',
          severity: 'high',
          confidence: confidence(80),
          fixable: 'manual',
          tags: ['test', 'error'],
          evidence: [
            createEvidence('command-log', {
              command: `npm run ${cmdName}`,
              label: 'test-error',
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
          title: `Test script '${cmdName}' was blocked by policy`,
          explanation: `The test command was blocked: ${result.blockReason}`,
          category: 'security',
          severity: 'high',
          confidence: confidence(95),
          fixable: 'manual',
          tags: ['test', 'blocked', 'policy'],
          evidence: [
            createCommandEvidence(
              `npm run ${cmdName}`,
              result.blockReason ?? '',
              -1,
              { label: 'blocked-test' }
            ),
          ],
        })
      );
      continue;
    }

    if (result.timedOut) {
      findings.push(
        createFinding({
          title: `Test script '${cmdName}' timed out`,
          explanation: `The test command exceeded the timeout and was killed.`,
          category: 'test',
          severity: 'high',
          confidence: confidence(90),
          fixable: 'manual',
          suggestedFix: `Increase the timeout or investigate why tests are hanging.`,
          tags: ['test', 'timeout'],
          evidence: [
            createCommandEvidence(
              `npm run ${cmdName}`,
              `Timed out after ${result.durationMs}ms\n${result.stdout}`,
              -1,
              { label: 'test-timeout' }
            ),
          ],
        })
      );
      continue;
    }

    if (result.exitCode !== 0) {
      // Determine severity: test failures with no output = critical; failures with passing tests but non-zero = high
      const hasActualFailingTests = /fail(ed|ures?)|error/i.test(result.stdout + result.stderr);
      findings.push(
        createFinding({
          title: `Test script '${cmdName}' failed with exit code ${result.exitCode}`,
          explanation: hasActualFailingTests
            ? `Tests failed — one or more test cases did not pass.`
            : `The test command exited with a non-zero code, possibly a configuration or setup issue.`,
          category: 'test',
          severity: hasActualFailingTests ? 'critical' : 'high',
          confidence: confidence(90),
          fixable: 'manual',
          suggestedFix: `Run tests manually to see failure details: npm run ${cmdName}`,
          tags: ['test', 'failure'],
          evidence: [
            createCommandEvidence(
              `npm run ${cmdName}`,
              result.stdout || result.stderr || '(no output)',
              result.exitCode ?? -1,
              { label: 'test-failure', exitCode: result.exitCode ?? undefined }
            ),
            result.logPath
              ? createEvidence('file', {
                  path: result.logPath,
                  label: 'test-log',
                  excerpt: `Full test log saved to: ${result.logPath}`,
                })
              : ({} as any),
          ].filter(Boolean),
        })
      );
    }
  }

  return {
    stageId: 'test',
    status: findings.some(f => f.severity === 'critical') ? 'failed' : 'completed',
    findings,
    durationMs: Date.now() - start,
  };
}
