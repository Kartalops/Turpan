/**
 * RunSummaryWriter — produces TURPAN_RUN_SUMMARY.json
 *
 * High-level run metadata for MCP consumers and programmatic callers.
 * Compact, stable schema — a single JSON object with everything an agent
 * or CI pipeline needs to decide what to do next.
 */

import { join } from 'path';
import type { TurpanAnalysisData } from './types.js';
import type { Scorecard as SharedScorecard } from '@turpan/shared';

export interface TurpanRunSummary {
  version:      string;
  runId:        string;
  runPath:      string;
  timestamp:    string;
  duration:     number; // ms
  projectPath:  string;
  verdict:      string;
  overallScore: number;
  findings:     FindingsSummary;
  scorecard:    SharedScorecard;
  fingerprint:  Record<string, unknown>;
  hasFixResult: boolean;
  hasUiReview:  boolean;
  hasSecurity:  boolean;
  hasAgentAudit: boolean;
  nextActions:  NextAction[];
}

export interface FindingsSummary {
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  info:     number;
  total:    number;
}

export interface NextAction {
  priority:  'critical' | 'high' | 'medium' | 'low';
  action:    string;
  reason:    string;
}

export class RunSummaryWriter {
  constructor(private data: TurpanAnalysisData) {}

  async write(runPath: string): Promise<string> {
    const { writeFileSync } = await import('fs');
    const content = JSON.stringify(this.build(), null, 2);
    const dest    = join(runPath, 'TURPAN_RUN_SUMMARY.json');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  build(): TurpanRunSummary {
    const { runId, runPath, timestamp, duration, findings, scorecard, verdict, fingerprint } = this.data;
    const counts = severityCounts(findings);

    return {
      version:      '1.0.0',
      runId,
      runPath,
      timestamp,
      duration,
      projectPath:  this.data.projectPath ?? '',
      verdict,
      overallScore: scorecard.overall ?? 0,
      findings: {
        critical: counts.critical,
        high:     counts.high,
        medium:   counts.medium,
        low:      counts.low,
        info:     counts.info,
        total:    findings.length,
      },
      scorecard,
      fingerprint: fingerprint ?? {},
      hasFixResult:  !!this.data.fixRunResult,
      hasUiReview:   !!this.data.uiReview,
      hasSecurity:   !!this.data.security,
      hasAgentAudit: !!this.data.agentAudit,
      nextActions:   this.deriveNextActions(counts, verdict),
    };
  }

  private deriveNextActions(
    counts: ReturnType<typeof severityCounts>,
    verdict: string
  ): NextAction[] {
    const actions: NextAction[] = [];

    if (counts.critical > 0) {
      actions.push({
        priority: 'critical',
        action:   'Resolve critical findings before any release',
        reason:   `${counts.critical} critical severity finding${counts.critical !== 1 ? 's' : ''} detected`,
      });
    }
    if (counts.high > 0) {
      actions.push({
        priority: 'high',
        action:   'Address high-severity findings',
        reason:   `${counts.high} high severity finding${counts.high !== 1 ? 's' : ''} detected`,
      });
    }
    if (verdict === 'GO' && this.data.findings.length === 0) {
      actions.push({
        priority: 'low',
        action:   'Mark as release-ready',
        reason:   'All checks passed — project is ready for release',
      });
    }
    if (this.data.fixRunResult && !this.data.fixRunResult.validation.allPassed) {
      actions.push({
        priority: 'high',
        action:   'Re-run validation after applying fixes',
        reason:   'Some fix validations failed',
      });
    }
    if (this.data.uiReview && this.data.uiReview.consoleErrors.length > 0) {
      actions.push({
        priority: 'medium',
        action:   'Investigate UI console errors',
        reason:   `${this.data.uiReview.consoleErrors.length} route(s) with console errors`,
      });
    }

    return actions;
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