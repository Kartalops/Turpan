/**
 * Typecheck Stage — runs TypeScript type checking.
 *
 * Tries detected typecheck commands first; falls back to `tsc --noEmit`
 * if TypeScript is detected in the project.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createCommandEvidence, createEvidence } from '../../findings/Evidence.js';
import { SafeCommandRunner } from '../SafeCommandRunner.js';
import type { CommandResult } from '../CommandResult.js';
import type { Finding } from '../../findings/Finding.js';

export async function runTypecheckStage(
  ctx: ReviewContext,
  options: { timeoutMs?: number; skipTypecheck?: boolean } = {}
): Promise<StageResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const { projectRoot, runId, fingerprint } = ctx;

  if (ctx.signal?.aborted) {
    return { stageId: 'typecheck', status: 'skipped', findings: [], durationMs: 0 };
  }
  if (options.skipTypecheck) {
    return { stageId: 'typecheck', status: 'skipped', findings: [], durationMs: 0, artifacts: { skipped: true } };
  }

  const runner = new SafeCommandRunner({ projectRoot, runId });

  // Check if TypeScript is even present
  const hasTsConfig = existsSync(join(projectRoot, 'tsconfig.json'));
  if (!hasTsConfig && fingerprint.typecheckCommands.length === 0) {
    return {
      stageId: 'typecheck',
      status: 'skipped',
      findings: [],
      durationMs: Date.now() - start,
      artifacts: { skipped: true, reason: 'No TypeScript config found' },
    };
  }

  // Try detected typecheck commands first
  const typecheckCommands = fingerprint.typecheckCommands.length > 0
    ? fingerprint.typecheckCommands
    : ['typecheck', 'types'];
  const packageScripts = fingerprint.packageScripts;

  let success = false;

  for (const cmdName of typecheckCommands) {
    if (ctx.signal?.aborted) break;
    if (!packageScripts[cmdName] && !hasTsConfig) continue;

    let result: CommandResult;
    const cmd = packageScripts[cmdName] ? `npm run ${cmdName}` : `tsc --noEmit`;

    try {
      result = await runner.run(cmd, {
        cwd: projectRoot,
        timeoutMs: options.timeoutMs ?? 120_000,
        saveLog: true,
        stageName: `typecheck-${cmdName}`,
        signal: ctx.signal,
      });
    } catch (err) {
      findings.push(
        createFinding({
          title: `Typecheck command threw an error`,
          explanation: err instanceof Error ? err.message : String(err),
          category: 'typecheck',
          severity: 'high',
          confidence: confidence(80),
          fixable: 'manual',
          tags: ['typecheck', 'error'],
          evidence: [
            createEvidence('command-log', {
              command: cmd,
              label: 'typecheck-error',
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
          title: `Typecheck script '${cmdName}' was blocked by policy`,
          explanation: `The typecheck command was blocked: ${result.blockReason}`,
          category: 'security',
          severity: 'high',
          confidence: confidence(95),
          fixable: 'manual',
          tags: ['typecheck', 'blocked', 'policy'],
          evidence: [
            createCommandEvidence(cmd, result.blockReason ?? '', -1, { label: 'blocked-typecheck' }),
          ],
        })
      );
      continue;
    }

    if (result.timedOut) {
      findings.push(
        createFinding({
          title: `Typecheck script '${cmdName}' timed out`,
          explanation: `The typecheck command exceeded the timeout and was killed.`,
          category: 'typecheck',
          severity: 'high',
          confidence: confidence(90),
          fixable: 'manual',
          tags: ['typecheck', 'timeout'],
          evidence: [
            createCommandEvidence(cmd, `Timed out after ${result.durationMs}ms`, -1, { label: 'typecheck-timeout' }),
          ],
        })
      );
      continue;
    }

    if (result.exitCode === 0) {
      success = true;
      break; // typecheck passed, no findings needed
    }

    if (result.exitCode !== 0) {
      findings.push(
        createFinding({
          title: `TypeScript type errors found (exit code ${result.exitCode})`,
          explanation:
            `The TypeScript compiler reported type errors. ` +
            `These are real type safety issues that should be fixed.`,
          category: 'typecheck',
          severity: 'high',
          confidence: confidence(90),
          fixable: 'manual',
          suggestedFix: `Fix type errors — run 'tsc --noEmit' for details`,
          tags: ['typecheck', 'failure'],
          evidence: [
            createCommandEvidence(
              cmd,
              result.stdout || result.stderr || '(no output)',
              result.exitCode ?? -1,
              { label: 'typecheck-output', exitCode: result.exitCode ?? undefined }
            ),
            result.logPath
              ? createEvidence('file', {
                  path: result.logPath,
                  label: 'typecheck-log',
                  excerpt: `Full typecheck log: ${result.logPath}`,
                })
              : ({} as any),
          ].filter(Boolean),
        })
      );
    }
  }

  return {
    stageId: 'typecheck',
    status: success ? 'completed' : findings.length > 0 ? 'failed' : 'skipped',
    findings,
    durationMs: Date.now() - start,
  };
}
