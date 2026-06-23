/**
 * Score calculation from Findings
 */

import type { Finding, Severity } from './Finding.js';
import { severityWeight, worstSeverity } from './severity.js';

export interface ScoreBreakdown {
  overall: number;
  build_health: number;
  test_health: number;
  code_quality: number;
  security: number;
  ui_runtime: number;
  architecture: number;
  dead_code: number;
  agent_output: number;
  release_readiness: number;
}

const CATEGORY_WEIGHTS: Record<string, number> = {
  build: 1.0,
  test: 1.0,
  lint: 0.5,
  typecheck: 0.8,
  security: 1.0,
  ui: 0.7,
  accessibility: 0.7,
  performance: 0.8,
  architecture: 0.6,
  'dead-code': 0.4,
  dependency: 0.5,
  'agent-output': 0.3,
  maintainability: 0.5,
  project: 0.3,
};

const CATEGORY_TO_SCORE_FIELD: Record<string, keyof ScoreBreakdown> = {
  build: 'build_health',
  test: 'test_health',
  lint: 'code_quality',
  typecheck: 'code_quality',
  security: 'security',
  ui: 'ui_runtime',
  accessibility: 'ui_runtime',
  performance: 'ui_runtime',
  architecture: 'architecture',
  'dead-code': 'dead_code',
  dependency: 'build_health',
  'agent-output': 'agent_output',
  maintainability: 'architecture',
  project: 'release_readiness',
};

/** Deduplicate findings by file+line to avoid double-penalizing */
function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    const key = `${f.file ?? ''}:${f.line ?? ''}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Calculate a 0–100 score for each dimension from a list of findings.
 * Higher score = healthier. 100 = no issues.
 */
export function calculateScorecard(findings: Finding[]): ScoreBreakdown {
  const unique = deduplicateFindings(findings);
  const counts = countByCategory(unique);

  const build_health   = categoryScore('build', counts);
  const test_health    = categoryScore('test', counts);
  const code_quality   = (categoryScore('lint', counts) + categoryScore('typecheck', counts)) / 2;
  const security       = categoryScore('security', counts);
  const ui_runtime     = (categoryScore('ui', counts) + categoryScore('accessibility', counts) + categoryScore('performance', counts)) / 3;
  const architecture   = (categoryScore('architecture', counts) + categoryScore('maintainability', counts)) / 2;
  const dead_code      = categoryScore('dead-code', counts);
  const agent_output   = categoryScore('agent-output', counts);
  const release_readiness = releaseScore(unique);

  const overall = Math.round(
    (build_health * 1.0 +
      test_health * 1.0 +
      code_quality * 0.8 +
      security * 1.0 +
      ui_runtime * 0.6 +
      architecture * 0.5 +
      dead_code * 0.3 +
      agent_output * 0.2 +
      release_readiness * 0.5) /
    (1.0 + 1.0 + 0.8 + 1.0 + 0.6 + 0.5 + 0.3 + 0.2 + 0.5)
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    build_health: Math.max(0, Math.min(100, Math.round(build_health))),
    test_health: Math.max(0, Math.min(100, Math.round(test_health))),
    code_quality: Math.max(0, Math.min(100, Math.round(code_quality))),
    security: Math.max(0, Math.min(100, Math.round(security))),
    ui_runtime: Math.max(0, Math.min(100, Math.round(ui_runtime))),
    architecture: Math.max(0, Math.min(100, Math.round(architecture))),
    dead_code: Math.max(0, Math.min(100, Math.round(dead_code))),
    agent_output: Math.max(0, Math.min(100, Math.round(agent_output))),
    release_readiness: Math.max(0, Math.min(100, Math.round(release_readiness))),
  };
}

function countByCategory(findings: Finding[]): Record<string, { critical: number; high: number; medium: number; low: number }> {
  const counts: Record<string, { critical: number; high: number; medium: number; low: number }> = {};
  for (const f of findings) {
    if (!counts[f.category]) counts[f.category] = { critical: 0, high: 0, medium: 0, low: 0 };
    if (f.severity !== 'info') counts[f.category][f.severity]++;
  }
  return counts;
}

/**
 * Each finding deducts points from 100 proportional to severity × confidence × weight.
 */
function categoryScore(
  category: string,
  counts: ReturnType<typeof countByCategory>
): number {
  const entry = counts[category];
  if (!entry) return 100;

  const weight = CATEGORY_WEIGHTS[category] ?? 0.5;
  const deductions =
    severityWeight('critical') * entry.critical * 2.0 +
    severityWeight('high') * entry.high * 1.5 +
    severityWeight('medium') * entry.medium * 1.0 +
    severityWeight('low') * entry.low * 0.5;

  const base = 100 - deductions * weight * 0.1;
  return Math.max(0, Math.min(100, base));
}

/**
 * Release readiness = 100 minus penalty for critical/high severity issues.
 */
function releaseScore(findings: Finding[]): number {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  const deduction = critical * 30 + high * 15;
  return Math.max(0, Math.min(100, 100 - deduction));
}

/** Count findings by severity */
export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** Count findings by category */
export function countByCategorySimple(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.category] = (counts[f.category] ?? 0) + 1;
  return counts;
}

/** Return the verdict based on scorecard */
export type Verdict = 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY';

export function computeVerdict(scorecard: ScoreBreakdown, findings: Finding[]): Verdict {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;

  if (critical > 0) return 'NO_GO';
  if (scorecard.security < 50) return 'NO_GO';
  if (scorecard.overall < 40) return 'NO_GO';
  if (critical === 0 && high === 0 && scorecard.overall >= 75) return 'GO';
  return 'CONDITIONAL_GO';
}
