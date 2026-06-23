/**
 * ScorecardWriter — produces TURPAN_SCORECARD.json
 *
 * Machine-readable scorecard + derived health dimensions.
 * Reads the shared Scorecard from @turpan/shared and enriches it with
 * derived health scores (Architecture, Dead Code, Agent Output, Release Readiness).
 */

import { join } from 'path';
import type { Scorecard as SharedScorecard } from '@turpan/shared';
import type { TurpanAnalysisData } from './types.js';

export interface TurpanScorecard {
  version:    string;
  runId:      string;
  timestamp:  string;
  overall:    number;
  verdict:    string;
  dimensions: {
    overall:          number;
    buildHealth:      HealthDimension;
    testHealth:       HealthDimension;
    codeQuality:      HealthDimension;
    security:         HealthDimension;
    uiRuntime:        HealthDimension;
    uiQuality:        HealthDimension;
    architecture:     HealthDimension;
    deadCode:         HealthDimension;
    agentOutput:      HealthDimension;
    releaseReadiness: HealthDimension;
  };
  findingsSummary: {
    critical: number;
    high:     number;
    medium:   number;
    low:      number;
    info:     number;
    total:    number;
  };
  raw: SharedScorecard;
}

export interface HealthDimension {
  score:   number; // 0–100
  label:   string;
  details: string[];
}

export class ScorecardWriter {
  constructor(private data: TurpanAnalysisData) {}

  async write(runPath: string): Promise<string> {
    const { writeFileSync } = await import('fs');
    const content = JSON.stringify(this.build(), null, 2);
    const dest    = join(runPath, 'TURPAN_SCORECARD.json');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  build(): TurpanScorecard {
    const { runId, timestamp, scorecard, findings, verdict, agentAudit } = this.data;
    const counts = severityCounts(findings);
    const overall = scorecard.overall ?? 0;

    const health = (label: string, score: number, details: string[] = []): HealthDimension => ({
      label, score, details,
    });

    // Derive sub-dimensions
    const buildHealth      = health('Build Health',      scorecard.categories?.correctness     ?? overall);
    const testHealth       = health('Test Health',       scorecard.categories?.codeCoverage    ?? overall);
    const codeQuality      = health('Code Quality',      scorecard.categories?.maintainability ?? overall);
    const security         = health('Security',          scorecard.categories?.security         ?? overall);
    const uiRuntime        = health('UI Runtime',        overall);
    const uiQuality        = health('UI Quality',        overall);
    const architecture     = health('Architecture',      this.deriveArchitectureScore());
    const deadCode         = health('Dead Code',         this.deriveDeadCodeScore());
    const agentOutputDetails: string[] = agentAudit
      ? [
          `Requested: ${agentAudit.requestedCapabilities.length}`,
          `Implemented: ${agentAudit.implementedCapabilities.length}`,
          `Missing: ${agentAudit.missingCapabilities.length}`,
          `Fake/Shallow: ${agentAudit.fakeShallowImpls.length}`,
          ...(agentAudit.issuesCount
            ? [
                `Critical: ${agentAudit.issuesCount.critical}`,
                `High: ${agentAudit.issuesCount.high}`,
                `Medium: ${agentAudit.issuesCount.medium}`,
                `Low: ${agentAudit.issuesCount.low}`,
              ]
            : []),
        ]
      : [];
    const agentOutput      = health('Agent Output', agentAudit?.completionScore ?? overall, agentOutputDetails);
    const releaseReadiness = health('Release Readiness', this.deriveReleaseReadinessScore(counts));

    return {
      version:  '1.0.0',
      runId,
      timestamp,
      overall,
      verdict,
      dimensions: {
        overall,
        buildHealth,
        testHealth,
        codeQuality,
        security,
        uiRuntime,
        uiQuality,
        architecture,
        deadCode,
        agentOutput,
        releaseReadiness,
      },
      findingsSummary: {
        critical: counts.critical,
        high:     counts.high,
        medium:   counts.medium,
        low:      counts.low,
        info:     counts.info,
        total:    findings.length,
      },
      raw: scorecard,
    };
  }

  private deriveArchitectureScore(): number {
    const { findings } = this.data;
    const archFindings = findings.filter(f =>
      f.category === 'architecture' || f.category === 'api-design'
    );
    const penalty = archFindings.reduce((sum, f) => {
      const s = { critical: 25, high: 15, medium: 7, low: 3, info: 0 };
      return sum + (s[f.severity] ?? 0);
    }, 0);
    return Math.max(0, 100 - penalty);
  }

  private deriveDeadCodeScore(): number {
    const { findings } = this.data;
    const deadFindings = findings.filter(f => f.category === 'dead-code');
    const penalty = deadFindings.reduce((sum, f) => {
      const s = { critical: 10, high: 6, medium: 3, low: 1, info: 0 };
      return sum + (s[f.severity] ?? 0);
    }, 0);
    return Math.max(0, 100 - penalty);
  }

  private deriveReleaseReadinessScore(counts: ReturnType<typeof severityCounts>): number {
    const { agentAudit } = this.data;
    let score = 100;
    score -= counts.critical * 20;
    score -= counts.high     * 10;
    score -= counts.medium   *  4;
    score -= counts.low      *  1;

    // Factor in agent audit quality
    if (agentAudit) {
      const agentScore = agentAudit.completionScore;
      const agentPenalty = Math.round((100 - agentScore) * 0.25); // agent gap weighted at 25%
      score -= agentPenalty;
      // Penalise critical/high agent issues
      const agentCriticalHigh = (agentAudit.issuesCount?.critical ?? 0) * 15
                              + (agentAudit.issuesCount?.high ?? 0) * 8;
      score -= agentCriticalHigh;
    }

    return Math.max(0, Math.min(100, score));
  }
}

function severityCounts(findings: import('@turpan/core').Finding[]) {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
    info:     findings.filter(f => f.severity === 'info').length,
  };
}