import { existsSync, readFileSync, readlinkSync } from 'fs';
import { join } from 'path';
import type { Finding, Scorecard } from '@turpan/shared';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface RunArtifacts {
  runId: string;
  findings: Finding[];
  scorecard: Scorecard;
}

export function createEmptyScorecard(): Scorecard {
  return {
    overall: 0,
    categories: {
      correctness: 0,
      security: 0,
      performance: 0,
      maintainability: 0,
      codeCoverage: 0,
    },
    findingsCount: 0,
    criticalIssues: 0,
  };
}

export function countFindingsBySeverity(findings: Finding[]): SeverityCounts {
  return findings.reduce<SeverityCounts>((counts, finding) => {
    counts[finding.severity] += 1;
    return counts;
  }, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
}

export function summarizeFindingSeverities(findings: Finding[]): string {
  const counts = countFindingsBySeverity(findings);
  const parts = [
    counts.critical > 0 ? `${counts.critical} critical` : null,
    counts.high > 0 ? `${counts.high} high` : null,
    counts.medium > 0 ? `${counts.medium} medium` : null,
    counts.low > 0 ? `${counts.low} low` : null,
    counts.info > 0 ? `${counts.info} info` : null,
  ].filter((value): value is string => value !== null);
  return parts.length > 0 ? parts.join(', ') : 'clean';
}

export function loadRunArtifacts(runPath: string): RunArtifacts {
  const findingsPath = join(runPath, 'TURPAN_FINDINGS.json');
  const scorecardPath = join(runPath, 'TURPAN_SCORECARD.json');
  const runId = runPath.split('/').pop() ?? 'unknown';

  let findings: Finding[] = [];
  let scorecard = createEmptyScorecard();

  if (existsSync(findingsPath)) {
    try {
      findings = JSON.parse(readFileSync(findingsPath, 'utf-8')).findings ?? [];
    } catch {
      findings = [];
    }
  }

  if (existsSync(scorecardPath)) {
    try {
      scorecard = JSON.parse(readFileSync(scorecardPath, 'utf-8')) as Scorecard;
    } catch {
      scorecard = createEmptyScorecard();
    }
  }

  return { runId, findings, scorecard };
}

export function getLatestRunPath(projectPath: string): string | null {
  const latest = join(projectPath, '.turpan', 'runs', 'latest');
  if (!existsSync(latest)) return null;
  try {
    return readlinkSync(latest);
  } catch {
    return latest;
  }
}

export function loadLatestRunArtifacts(projectPath: string): RunArtifacts {
  const latest = getLatestRunPath(projectPath);
  if (!latest) {
    return {
      runId: 'unknown',
      findings: [],
      scorecard: createEmptyScorecard(),
    };
  }
  return loadRunArtifacts(latest);
}
