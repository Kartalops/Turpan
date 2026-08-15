import type { Finding } from '@turpan/core';
import type { FixEligibility } from './autofixTypes.js';

const AUTO_FIXABLE_HINTS = [
  /missing await/i,
  /broken import/i,
  /null/i,
  /undefined/i,
  /config mismatch/i,
  /unsafe default/i,
  /no-?op/i,
  /unwired/i,
  /missing test/i,
];

const HUMAN_REQUIRED_HINTS = [
  /architecture/i,
  /redesign/i,
  /business logic/i,
  /authorization policy/i,
  /permission model/i,
  /database migration/i,
  /public api/i,
  /semantic change/i,
];

export function classifyFixEligibility(finding: Finding): FixEligibility {
  const text = [
    finding.title,
    finding.explanation,
    finding.category,
    finding.severity,
    finding.tags?.join(' ') ?? '',
  ].join('\n');

  if (finding.fixable === 'none') return 'NOT_FIXABLE';
  if (finding.evidence.length === 0 || finding.confidence < 60) return 'NOT_FIXABLE';
  if (HUMAN_REQUIRED_HINTS.some((hint) => hint.test(text))) return 'HUMAN_REQUIRED';
  if (finding.fixable === 'auto') return 'AUTO_FIXABLE';
  if (AUTO_FIXABLE_HINTS.some((hint) => hint.test(text))) return 'AUTO_FIXABLE';
  if (finding.fixable === 'manual') return 'PATCH_PROPOSAL_ONLY';

  return 'PATCH_PROPOSAL_ONLY';
}
