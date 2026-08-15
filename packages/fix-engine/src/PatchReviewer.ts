import type { PatchCandidate, PatchReviewResult } from './autofixTypes.js';

export function adversarialPatchReview(candidate: PatchCandidate): PatchReviewResult {
  const concerns: PatchReviewResult['concerns'] = [];
  const diff = candidate.unifiedDiff;

  if (/package\.json|pnpm-lock\.yaml|package-lock\.json/.test(diff)) {
    concerns.push({
      category: 'dependency',
      severity: 'high',
      explanation: 'Patch changes dependencies; this is outside the default minimal patch budget.',
    });
  }

  if (/export\s+interface|export\s+type|export\s+function|export\s+class/.test(diff) && candidate.changeSummary.filesChanged.length > 1) {
    concerns.push({
      category: 'public-api',
      severity: 'medium',
      explanation: 'Patch may alter public API surface across multiple files.',
    });
  }

  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(diff)) {
    concerns.push({
      category: 'error-handling',
      severity: 'high',
      explanation: 'Patch appears to swallow errors.',
    });
  }

  if (candidate.changeSummary.linesAdded + candidate.changeSummary.linesRemoved > 120) {
    concerns.push({
      category: 'complexity',
      severity: 'medium',
      explanation: 'Patch is large for an autonomous repair attempt.',
    });
  }

  return {
    reviewer: 'deterministic-adversarial-patch-reviewer',
    approved: !concerns.some((concern) => concern.severity === 'high' || concern.severity === 'critical'),
    concerns,
  };
}
