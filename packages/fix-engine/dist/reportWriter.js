/**
 * ReportWriter — writes TURPAN_FIX_PLAN.md, TURPAN_PATCH.diff, TURPAN_FIX_RESULT.json
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { formatPatchHeader } from './PatchGenerator.js';
// ─── Fix Plan Report ─────────────────────────────────────────────────────────
function renderCandidate(c) {
    const file = c.filePath.split('/').pop() ?? c.filePath;
    const lines = c.startLine === c.endLine
        ? `L${c.startLine}`
        : `L${c.startLine}–${c.endLine}`;
    return [
        `### ${c.description}`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| ID | \`${c.id}\` |`,
        `| Finding | \`${c.finding.id}\` |`,
        `| File | \`${file}\` ${lines} |`,
        `| Category | ${c.category} |`,
        `| Risk | ${c.risk} |`,
        `| Confidence | ${c.confidence}% |`,
        `| Reversible | ${c.reversible ? 'Yes' : 'No'} |`,
        `| Required checks | ${c.requiredChecks.join(', ') || 'none'} |`,
        '',
        `**Explanation:** ${c.finding.explanation}`,
        '',
        c.finding.suggestedFix
            ? `**Suggested fix:** \`\`\`\n${c.finding.suggestedFix}\n\`\`\`\n`
            : '',
    ].join('\n');
}
export function renderFixPlanReport(plan) {
    const lines = [];
    lines.push(`# Turpan Fix Plan`);
    lines.push(`*Generated: ${plan.generatedAt}*`);
    lines.push('');
    lines.push(`## Summary`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Run ID | \`${plan.runId}\` |`);
    lines.push(`| Fix Mode | \`${plan.fixMode}\` |`);
    lines.push(`| Project | ${plan.projectRoot} |`);
    lines.push(`| Git Dirty | ${plan.gitDirty ? '⚠️ Yes' : '✅ Clean'} |`);
    lines.push(`| Min Confidence | ${plan.policy.minConfidenceThreshold}% |`);
    lines.push('');
    lines.push(`## Candidate Counts`);
    lines.push('');
    lines.push(`| Category | Count |`);
    lines.push(`|----------|-------|`);
    lines.push(`| Total | ${plan.candidates.length} |`);
    lines.push(`| Applied | ${plan.applied.length} |`);
    lines.push(`| Rejected | ${plan.rejected.length} |`);
    lines.push(`| Deferred | ${plan.deferred.length} |`);
    lines.push('');
    if (plan.applied.length > 0) {
        lines.push(`## Applied Fixes`);
        lines.push('');
        for (const c of plan.applied) {
            lines.push(renderCandidate(c));
            lines.push('');
        }
    }
    if (plan.rejected.length > 0) {
        lines.push(`## Rejected Fixes`);
        lines.push('');
        lines.push(`| Candidate | Finding | Reason |`);
        lines.push(`|-----------|---------|--------|`);
        for (const c of plan.rejected) {
            const reason = plan.policy.blockedCategories.includes(c.category)
                ? `Blocked: ${c.category} category`
                : `Confidence below ${plan.policy.minConfidenceThreshold}%`;
            lines.push(`| ${c.description} | \`${c.finding.id}\` | ${reason} |`);
        }
        lines.push('');
    }
    if (plan.deferred.length > 0) {
        lines.push(`## Deferred Fixes`);
        lines.push('');
        lines.push(`*Awaiting interactive confirmation:*`);
        lines.push('');
        for (const c of plan.deferred) {
            lines.push(renderCandidate(c));
            lines.push('');
        }
    }
    lines.push(`## Required Validation Checks`);
    lines.push('');
    if (plan.requiredChecks.length === 0) {
        lines.push('None.');
    }
    else {
        lines.push(plan.requiredChecks.map((c) => `- [ ] ${c}`).join('\n'));
    }
    lines.push('');
    lines.push(`## Policy Applied`);
    lines.push('');
    lines.push(`\`\`\`json`);
    lines.push(JSON.stringify(plan.policy, null, 2));
    lines.push(`\`\`\``);
    return lines.join('\n');
}
// ─── Fix Result Report ───────────────────────────────────────────────────────
export function renderFixResultReport(result) {
    const lines = [];
    lines.push(`# Turpan Fix Result`);
    lines.push(`*Run ID: ${result.runId} | Mode: ${result.fixMode}*`);
    lines.push('');
    lines.push(`## Summary`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Started | ${result.startedAt} |`);
    lines.push(`| Completed | ${result.completedAt ?? 'in progress'} |`);
    lines.push(`| Duration | ${Math.round(result.durationMs / 1000)}s |`);
    lines.push(`| Total Candidates | ${result.totalCandidates} |`);
    lines.push(`| Applied | ${result.applied.length} |`);
    lines.push(`| Rejected | ${result.rejected.length} |`);
    lines.push(`| Deferred | ${result.deferred.length} |`);
    lines.push(`| Git Was Dirty | ${result.gitWasDirty ? '⚠️ Yes' : '✅ No'} |`);
    lines.push(`| Worked in Worktree | ${result.workedInWorktree ? '✅ Yes' : 'No'} |`);
    lines.push('');
    lines.push(`## Files Changed`);
    lines.push('');
    lines.push(`| Type | Count |`);
    lines.push(`|------|-------|`);
    lines.push(`| Modified | ${result.patchResult.filesModified.length} |`);
    lines.push(`| Created | ${result.patchResult.filesCreated.length} |`);
    lines.push(`| Deleted | ${result.patchResult.filesDeleted.length} |`);
    lines.push('');
    lines.push(`## Validation`);
    lines.push('');
    if (result.validation.results.length === 0) {
        lines.push('No validation checks were run.');
    }
    else {
        lines.push(`**Overall:** ${result.validation.allPassed ? '✅ PASSED' : '❌ FAILED'}`);
        lines.push('');
        lines.push(`| Check | Status | Duration |`);
        lines.push(`|-------|--------|----------|`);
        for (const r of result.validation.results) {
            lines.push(`| ${r.check} | ${r.passed ? '✅' : '❌'} | ${Math.round(r.durationMs / 1000)}s |`);
        }
        lines.push('');
        lines.push(`Total: ${Math.round(result.validation.totalDurationMs / 1000)}s`);
    }
    lines.push('');
    if (result.rollback) {
        lines.push(`## Rollback`);
        lines.push('');
        lines.push(`⚠️ **Validation failed — rollback was triggered.**`);
        lines.push('');
        lines.push(`| Field | Value |`);
        lines.push(`|-------|-------|`);
        lines.push(`| Reason | ${result.rollback.reason} |`);
        lines.push(`| Timestamp | ${result.rollback.timestamp} |`);
        lines.push(`| Patches | ${result.rollback.patches.length} |`);
        lines.push(`| Fingerprints | ${result.rollback.appliedFingerprints.join(', ')} |`);
        lines.push('');
    }
    lines.push(`## Applied Fixes`);
    lines.push('');
    for (const item of result.applied) {
        lines.push(`- \`${item.candidateId}\` — \`${item.findingId}\` — applied at ${item.appliedAt}`);
    }
    lines.push('');
    if (result.rejected.length > 0) {
        lines.push(`## Rejected Fixes`);
        lines.push('');
        for (const item of result.rejected) {
            lines.push(`- \`${item.candidateId}\` — \`${item.findingId}\` — ${item.rejectionReason}`);
        }
        lines.push('');
    }
    if (result.deferred.length > 0) {
        lines.push(`## Deferred Fixes`);
        lines.push('');
        for (const item of result.deferred) {
            lines.push(`- \`${item.candidateId}\` — \`${item.findingId}\` — awaiting confirmation`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
function ensureDir(filePath) {
    const dir = join(filePath, '..');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
export function writeFixReport(plan, result, patchDiff, projectRoot) {
    const baseDir = join(projectRoot, '.turpan', 'fixes', plan.runId);
    const fixPlanPath = join(baseDir, 'TURPAN_FIX_PLAN.md');
    const patchDiffPath = join(baseDir, 'TURPAN_PATCH.diff');
    const resultJsonPath = join(baseDir, 'TURPAN_FIX_RESULT.json');
    // Write fix plan
    ensureDir(fixPlanPath);
    writeFileSync(fixPlanPath, renderFixPlanReport(plan), 'utf-8');
    // Write patch diff
    ensureDir(patchDiffPath);
    const header = formatPatchHeader(plan.fixMode, plan.projectRoot);
    writeFileSync(patchDiffPath, header + patchDiff, 'utf-8');
    // Write result JSON
    ensureDir(resultJsonPath);
    writeFileSync(resultJsonPath, JSON.stringify(result, null, 2), 'utf-8');
    return { fixPlanPath, patchDiffPath, resultJsonPath };
}
//# sourceMappingURL=reportWriter.js.map