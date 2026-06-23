/**
 * FixPlanner — orchestrates the complete fix workflow.
 *
 * Workflow:
 *  1. Load findings
 *  2. Select fixable findings
 *  3. Generate FixCandidates
 *  4. Apply FixPolicy (filter/reject)
 *  5. Produce FixPlan
 */
import { createFixCandidates, filterByConfidence, aggregateRequiredChecks, } from './FixCandidate.js';
import { policyForMode, isAutoApplicable, requiresConfirmation, } from './FixPolicy.js';
// ─── Rejection Helper ─────────────────────────────────────────────────────────
function rejectCandidate(candidate, reason) {
    return {
        candidateId: candidate.id,
        findingId: candidate.finding.id,
        decision: 'rejected',
        rejectionReason: reason,
    };
}
// ─── Planner ─────────────────────────────────────────────────────────────────
/**
 * Build a FixPlan from findings, applying policy rules.
 */
export function buildFixPlan(config) {
    const { projectRoot, fixMode, findings, policyOverrides = {}, signal, } = config;
    const policy = policyForMode(fixMode, policyOverrides);
    const runId = `fix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    // Step 1: generate candidates from fixable findings
    let candidates = createFixCandidates(findings, projectRoot);
    // Step 2: filter by confidence threshold
    candidates = filterByConfidence(candidates, policy.minConfidenceThreshold);
    // Step 3: classify into applied / rejected / deferred
    const applied = [];
    const rejected = [];
    const deferred = [];
    for (const candidate of candidates) {
        if (signal?.aborted)
            break;
        // Policy: is this category blocked?
        if (policy.blockedCategories.includes(candidate.category)) {
            rejected.push(candidate);
            continue;
        }
        // Policy: new dependencies not allowed
        if (candidate.finding.category === 'dependency' &&
            !policy.allowNewDependencies) {
            // Check if it's a "remove" (safe) vs "add" (not allowed without flag)
            if (!candidate.description.toLowerCase().includes('remove')) {
                rejected.push(candidate);
                continue;
            }
        }
        // Mode-based routing
        switch (fixMode) {
            case 'report-only':
                // In report-only, nothing is applied — show what WOULD be done
                applied.push(candidate);
                break;
            case 'patch-only':
                // patch-only: generate diffs for all non-unsafe
                applied.push(candidate);
                break;
            case 'apply':
                if (requiresConfirmation(policy, fixMode, candidate.category)) {
                    deferred.push(candidate);
                }
                else {
                    applied.push(candidate);
                }
                break;
            case 'interactive':
                deferred.push(candidate);
                break;
            case 'auto-safe':
                if (isAutoApplicable(policy, candidate.category) && candidate.autoSafe) {
                    applied.push(candidate);
                }
                else if (candidate.category === 'manual') {
                    deferred.push(candidate);
                }
                else {
                    rejected.push(candidate);
                }
                break;
        }
    }
    const requiredChecks = aggregateRequiredChecks([...applied, ...deferred]);
    return {
        runId,
        fixMode,
        projectRoot,
        policy,
        candidates,
        applied,
        rejected,
        deferred,
        requiredChecks,
        gitDirty: false, // will be updated by caller
        generatedAt: new Date().toISOString(),
    };
}
/**
 * Build the full FixRunResult from a FixPlan.
 * This is the complete output including patch, validation, and rollback info.
 */
export function buildFixRunResult(plan, patchResult, validation, options) {
    const applied = plan.applied.map(c => ({
        candidateId: c.id,
        findingId: c.finding.id,
        decision: 'applied',
        appliedAt: new Date().toISOString(),
    }));
    const rejected = plan.rejected.map(c => rejectCandidate(c, 'policy-blocked'));
    const deferred = plan.deferred.map(c => ({
        candidateId: c.id,
        findingId: c.finding.id,
        decision: 'deferred',
    }));
    return {
        runId: plan.runId,
        fixMode: plan.fixMode,
        projectRoot: plan.projectRoot,
        startedAt: plan.generatedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0, // filled by caller
        totalCandidates: plan.candidates.length,
        applied,
        rejected,
        deferred,
        patchResult,
        validation,
        rollback: options.rollback,
        gitWasDirty: options.gitDirty,
        workedInWorktree: options.workedInWorktree,
        fixPlanPath: options.fixPlanPath,
        patchDiffPath: options.patchDiffPath,
        resultJsonPath: options.resultJsonPath,
    };
}
/**
 * Summarize a FixPlan in human-readable form.
 */
export function summarizePlan(plan) {
    const lines = [];
    lines.push(`Fix Plan — ${plan.fixMode}`);
    lines.push(`  Run ID:    ${plan.runId}`);
    lines.push(`  Project:   ${plan.projectRoot}`);
    lines.push(`  Mode:      ${plan.fixMode}`);
    lines.push(`  Policy:    minConfidence=${plan.policy.minConfidenceThreshold}`);
    lines.push(`  Candidates: ${plan.candidates.length} total`);
    lines.push(`  Applied:   ${plan.applied.length}`);
    lines.push(`  Rejected:  ${plan.rejected.length}`);
    lines.push(`  Deferred:  ${plan.deferred.length}`);
    lines.push(`  Required checks: ${plan.requiredChecks.join(', ') || 'none'}`);
    lines.push('');
    if (plan.rejected.length > 0) {
        lines.push('  Rejected candidates:');
        for (const c of plan.rejected) {
            lines.push(`    [${c.category}] ${c.description} — ${c.finding.file ?? 'no file'}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=FixPlanner.js.map