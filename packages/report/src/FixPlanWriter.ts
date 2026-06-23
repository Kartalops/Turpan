/**
 * FixPlanWriter — produces TURPAN_FIX_PLAN.md and TURPAN_PATCH.diff
 *
 * TURPAN_FIX_PLAN.md:   human-readable safe / risky / deferred breakdown
 * TURPAN_PATCH.diff:    unified patch content extracted from fix engine result
 *
 * Both files are optional — only produced when a fix run completed.
 */

import { join } from 'path';
import type { TurpanAnalysisData } from './types.js';
import type { FixRunResult } from '@turpan/fix-engine';

export class FixPlanWriter {
  constructor(private data: TurpanAnalysisData) {}

  /** Return rendered fix plan markdown (used by tests). */
  render(): string {
    return this.renderFixPlan();
  }

  /** Write both TURPAN_FIX_PLAN.md and TURPAN_PATCH.diff. Returns paths written. */
  async write(runPath: string): Promise<{ fixPlanPath: string; patchPath?: string }> {
    const { writeFileSync } = await import('fs');

    const fixPlanPath = join(runPath, 'TURPAN_FIX_PLAN.md');
    writeFileSync(fixPlanPath, this.renderFixPlan(), 'utf-8');

    let patchPath: string | undefined;
    const patchContent = this.extractPatchContent();
    if (patchContent) {
      patchPath = join(runPath, 'TURPAN_PATCH.diff');
      writeFileSync(patchPath, patchContent, 'utf-8');
    }

    return { fixPlanPath, patchPath };
  }

  // ─── Fix Plan ──────────────────────────────────────────────────────────────

  private renderFixPlan(): string {
    const { fixRunResult } = this.data;
    if (!fixRunResult) return '# Fix Plan\n\n_No fix run recorded for this review._\n';

    const lines: string[] = ['# Turpan Fix Plan', ''];

    lines.push(`**Run:** ${fixRunResult.runId}`);
    lines.push(`**Mode:** ${fixRunResult.fixMode}`);
    lines.push(`**Duration:** ${fixRunResult.durationMs}ms`);
    lines.push('');

    // Summary
    lines.push('## Summary', '');
    lines.push(`| Metric | Count |`, '|--------|-------|');
    lines.push(`| Total candidates | ${fixRunResult.totalCandidates} |`);
    lines.push(`| Applied | ${fixRunResult.applied.length} |`);
    lines.push(`| Rejected | ${fixRunResult.rejected.length} |`);
    lines.push(`| Deferred | ${fixRunResult.deferred.length} |`);
    lines.push(`| All validation passed | ${fixRunResult.validation.allPassed ? '✅ Yes' : '❌ No'} |`);
    lines.push('');

    // Safe fixes
    lines.push('## Safe Fixes (Auto-Applicable)', '');
    const applied = fixRunResult.applied;
    if (applied.length === 0) {
      lines.push('_No safe fixes were applied._', '');
    } else {
      for (const r of applied) {
        const valStatus = r.validation?.allPassed ? '✅' : '❌';
        lines.push(`- ✅ \`${r.candidateId}\` — applied ${valStatus}`);
        if (r.diff) {
          lines.push('', '```diff', r.diff, '```', '');
        }
      }
      lines.push('');
    }

    // Risky fixes
    lines.push('## Risky Fixes (Blocked by Policy)', '');
    const risky = fixRunResult.rejected.filter(r =>
      r.rejectionReason !== 'user-declined' && r.rejectionReason !== 'unknown-file'
    );
    if (risky.length === 0) {
      lines.push('_No risky fixes rejected._', '');
    } else {
      for (const r of risky) {
        lines.push(`- ⚠️ \`${r.candidateId}\` — rejected: \`${r.rejectionReason ?? 'unknown'}\``);
      }
      lines.push('');
    }

    // Deferred
    lines.push('## Deferred Fixes', '');
    const deferred = fixRunResult.deferred;
    if (deferred.length === 0) {
      lines.push('_No deferred fixes._', '');
    } else {
      for (const r of deferred) {
        lines.push(`- ⏳ \`${r.candidateId}\` — awaiting confirmation`);
      }
      lines.push('');
    }

    // Files modified
    lines.push('## Files Modified', '');
    const { patchResult } = fixRunResult;
    if (patchResult.filesModified.length === 0) {
      lines.push('_No files modified._', '');
    } else {
      for (const f of patchResult.filesModified) {
        lines.push(`- \`${f}\``);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ─── Patch diff ────────────────────────────────────────────────────────────

  private extractPatchContent(): string | undefined {
    const { fixRunResult } = this.data;
    return fixRunResult?.patchResult?.patchContent;
  }
}