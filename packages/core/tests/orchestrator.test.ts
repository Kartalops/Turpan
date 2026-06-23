/**
 * ReviewOrchestrator tests
 * - ReviewPlan generation
 * - Score calculation
 * - Finding severity formatting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateScorecard,
  computeVerdict,
  countBySeverity,
  countByCategorySimple,
} from '../src/findings/score.js';
import {
  generateReviewPlan,
  formatPlanSummary,
} from '../src/orchestrator/ReviewPlan.js';
import {
  formatSeverity,
  severityCode,
  severityWeight,
  worstSeverity,
  SEVERITY_DESCRIPTIONS,
  SEVERITY_ORDER,
} from '../src/findings/severity.js';
import { createFinding, confidence } from '../src/findings/Finding.js';
import { createCodeEvidence, createCommandEvidence, createMetricEvidence } from '../src/findings/Evidence.js';
import type { ProjectFingerprint } from '../src/project/index.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeFingerprint(overrides: Partial<ProjectFingerprint> = {}): ProjectFingerprint {
  return {
    projectRoot: '/tmp/test-project',
    projectName: 'test-project',
    repositoryStatus: { isGitRepo: false },
    packageManager: 'npm',
    languages: ['TypeScript'],
    runtimeType: 'node',
    appType: 'unknown',
    uiFramework: 'unknown',
    backendFramework: 'unknown',
    testTools: ['vitest'],
    buildCommands: ['npm run build'],
    devCommands: ['npm run dev'],
    lintCommands: ['npm run lint'],
    typecheckCommands: ['npm run typecheck'],
    testCommands: ['npm run test'],
    packageScripts: { build: 'tsc', test: 'vitest', lint: 'eslint', typecheck: 'tsc --noEmit' },
    dockerAvailable: false,
    dockerComposeAvailable: false,
    envFiles: [],
    envRequirements: [],
    routeHints: [],
    entrypoints: [],
    databaseHints: [],
    authHints: [],
    deploymentHints: {},
    detectedFiles: ['package.json'],
    missingFiles: [],
    fingerprintedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Score calculation tests ────────────────────────────────────────────────────

describe('calculateScorecard', () => {
  it('returns 100 when there are no findings', () => {
    const card = calculateScorecard([]);
    expect(card.overall).toBe(100);
    expect(card.build_health).toBe(100);
    expect(card.test_health).toBe(100);
    expect(card.security).toBe(100);
  });

  it('deducts points for critical build findings', () => {
    const finding = createFinding({
      id: 'test-1',
      title: 'Build fails',
      severity: 'critical',
      category: 'build',
      explanation: 'Build command exits non-zero',
      evidence: [createCommandEvidence('npm run build', 'Error: exit 1', 1)],
      fixable: 'none',
      confidence: confidence(90),
    });
    const card = calculateScorecard([finding]);
    expect(card.build_health).toBeLessThan(100);
  });

  it('deducts points for high security findings', () => {
    const finding = createFinding({
      id: 'test-2',
      title: 'SQL injection possible',
      severity: 'high',
      category: 'security',
      explanation: 'User input concatenated into SQL query',
      evidence: [createCodeEvidence('src/db.ts', 'query = "SELECT * FROM users WHERE id = " + req.params.id')],
      fixable: 'manual',
      confidence: confidence(85),
    });
    const card = calculateScorecard([finding]);
    expect(card.security).toBeLessThan(100);
  });

  it('penalizes release_readiness for critical findings', () => {
    const finding = createFinding({
      id: 'test-3',
      title: 'Memory leak in production',
      severity: 'critical',
      category: 'performance',
      explanation: 'Event listeners not cleaned up',
      evidence: [createCodeEvidence('src/server.ts', 'server.on("connection", handler)')],
      fixable: 'auto',
      confidence: confidence(95),
    });
    const card = calculateScorecard([finding]);
    expect(card.release_readiness).toBeLessThan(100);
  });

  it('deducts more for higher severity at same confidence', () => {
    const critical = createFinding({
      id: 'a', title: 'A', severity: 'critical', category: 'build',
      explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x')],
      fixable: 'none', confidence: confidence(100),
    });
    const medium = createFinding({
      id: 'b', title: 'B', severity: 'medium', category: 'build',
      explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x')],
      fixable: 'none', confidence: confidence(100),
    });
    const criticalScore = calculateScorecard([critical]).build_health;
    const mediumScore = calculateScorecard([medium]).build_health;
    expect(criticalScore).toBeLessThan(mediumScore);
  });

  it('caps all scores at 0 minimum', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      createFinding({
        id: `f-${i}`, title: `Finding ${i}`, severity: 'critical', category: 'security',
        explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x'.repeat(100))],
        fixable: 'none', confidence: confidence(100),
      })
    );
    const card = calculateScorecard(many);
    expect(card.security).toBeGreaterThanOrEqual(0);
    expect(card.overall).toBeGreaterThanOrEqual(0);
  });
});

describe('computeVerdict', () => {
  it('returns GO when scorecard is high and no critical/high findings', () => {
    const card = calculateScorecard([]);
    const verdict = computeVerdict(card, []);
    expect(verdict).toBe('GO');
  });

  it('returns NO_GO when any critical finding exists', () => {
    const finding = createFinding({
      id: 'x', title: 'x', severity: 'critical', category: 'build',
      explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x')],
      fixable: 'none', confidence: confidence(100),
    });
    const card = calculateScorecard([]);
    expect(computeVerdict(card, [finding])).toBe('NO_GO');
  });

  it('returns NO_GO when security score is below 50', () => {
    const finding = createFinding({
      id: 'x', title: 'x', severity: 'high', category: 'security',
      explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x')],
      fixable: 'none', confidence: confidence(100),
    });
    // Multiple security findings will drive security below 50
    const many = Array.from({ length: 10 }, (_, i) => ({ ...finding, id: `s-${i}` }));
    const card = calculateScorecard(many as any);
    const verdict = computeVerdict(card, many as any);
    expect(['NO_GO', 'CONDITIONAL_GO']).toContain(verdict);
  });

  it('returns NO_GO when overall is below 40', () => {
    const finding = createFinding({
      id: 'x', title: 'x', severity: 'critical', category: 'architecture',
      explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x')],
      fixable: 'none', confidence: confidence(100),
    });
    const many = Array.from({ length: 10 }, (_, i) => ({ ...finding, id: `a-${i}` }));
    const card = calculateScorecard(many as any);
    expect(computeVerdict(card, many as any)).toBe('NO_GO');
  });
});

describe('countBySeverity', () => {
  it('counts findings by severity', () => {
    const findings = [
      { severity: 'critical' as const }, { severity: 'critical' as const },
      { severity: 'high' as const },
      { severity: 'medium' as const }, { severity: 'medium' as const }, { severity: 'medium' as const },
    ] as any[];
    const counts = countBySeverity(findings);
    expect(counts.critical).toBe(2);
    expect(counts.high).toBe(1);
    expect(counts.medium).toBe(3);
    expect(counts.low).toBe(0);
    expect(counts.info).toBe(0);
  });
});

describe('countByCategorySimple', () => {
  it('counts findings by category', () => {
    const findings = [
      { category: 'security' }, { category: 'security' }, { category: 'build' }, { category: 'test' },
    ] as any[];
    const counts = countByCategorySimple(findings);
    expect(counts.security).toBe(2);
    expect(counts.build).toBe(1);
    expect(counts.test).toBe(1);
  });
});

// ── Severity formatting tests ────────────────────────────────────────────────

describe('formatSeverity', () => {
  it('uppercases the severity name', () => {
    expect(formatSeverity('critical')).toBe('CRITICAL');
    expect(formatSeverity('high')).toBe('HIGH');
    expect(formatSeverity('medium')).toBe('MEDIUM');
    expect(formatSeverity('low')).toBe('LOW');
    expect(formatSeverity('info')).toBe('INFO');
  });
});

describe('severityCode', () => {
  it('returns compact codes', () => {
    expect(severityCode('critical')).toBe('CRIT');
    expect(severityCode('high')).toBe('HIGH');
    expect(severityCode('medium')).toBe('MED');
    expect(severityCode('low')).toBe('LOW');
    expect(severityCode('info')).toBe('INFO');
  });
});

describe('severityWeight', () => {
  it('returns higher weight for more severe issues', () => {
    expect(severityWeight('critical')).toBeGreaterThan(severityWeight('high'));
    expect(severityWeight('high')).toBeGreaterThan(severityWeight('medium'));
    expect(severityWeight('medium')).toBeGreaterThan(severityWeight('low'));
    expect(severityWeight('low')).toBeGreaterThan(severityWeight('info'));
  });
});

describe('worstSeverity', () => {
  it('returns the most severe from a list', () => {
    expect(worstSeverity(['low', 'medium', 'high'])).toBe('high');
    expect(worstSeverity(['info', 'critical'])).toBe('critical');
    expect(worstSeverity(['low', 'low', 'medium'])).toBe('medium');
  });
});

describe('SEVERITY_ORDER', () => {
  it('is ordered from most to least severe', () => {
    expect(SEVERITY_ORDER[0]).toBe('critical');
    expect(SEVERITY_ORDER[SEVERITY_ORDER.length - 1]).toBe('info');
  });
});

describe('SEVERITY_DESCRIPTIONS', () => {
  it('has an entry for every severity', () => {
    for (const sev of SEVERITY_ORDER) {
      expect(SEVERITY_DESCRIPTIONS[sev]).toBeDefined();
      expect(typeof SEVERITY_DESCRIPTIONS[sev]).toBe('string');
      expect(SEVERITY_DESCRIPTIONS[sev].length).toBeGreaterThan(0);
    }
  });
});

// ── ReviewPlan generation tests ───────────────────────────────────────────────

describe('generateReviewPlan', () => {
  it('always includes the three core stages', () => {
    const fp = makeFingerprint({ buildCommands: [], testCommands: [], lintCommands: [], typecheckCommands: [] });
    const plan = generateReviewPlan(fp);
    const ids = plan.stages.map(s => s.id);
    expect(ids).toContain('project-fingerprint');
    expect(ids).toContain('install-check');
    expect(ids).toContain('script-detection');
  });

  it('includes build stage when build commands detected', () => {
    const fp = makeFingerprint({ buildCommands: ['npm run build'] });
    const plan = generateReviewPlan(fp);
    expect(plan.stages.map(s => s.id)).toContain('build');
  });

  it('skips build stage when no build commands', () => {
    const fp = makeFingerprint({ buildCommands: [] });
    const plan = generateReviewPlan(fp);
    expect(plan.stages.map(s => s.id)).not.toContain('build');
  });

  it('includes test stage when test commands detected', () => {
    const fp = makeFingerprint({ testCommands: ['npm run test'] });
    const plan = generateReviewPlan(fp);
    expect(plan.stages.map(s => s.id)).toContain('test');
  });

  it('includes lint and typecheck when those commands exist', () => {
    const fp = makeFingerprint({ lintCommands: ['npm run lint'], typecheckCommands: ['npm run typecheck'] });
    const plan = generateReviewPlan(fp);
    expect(plan.stages.map(s => s.id)).toContain('lint');
    expect(plan.stages.map(s => s.id)).toContain('typecheck');
  });

  it('includes deep stages only when deepAnalysis is true', () => {
    const fp = makeFingerprint({});
    const plan = generateReviewPlan(fp, { deepAnalysis: false });
    expect(plan.stages.map(s => s.id)).not.toContain('security-basic');
    expect(plan.stages.map(s => s.id)).not.toContain('dead-code-basic');
    expect(plan.stages.map(s => s.id)).not.toContain('static-quality');

    const planDeep = generateReviewPlan(fp, { deepAnalysis: true });
    expect(planDeep.stages.map(s => s.id)).toContain('security-basic');
    expect(planDeep.stages.map(s => s.id)).toContain('dead-code-basic');
    expect(planDeep.stages.map(s => s.id)).toContain('static-quality');
  });

  it('includes ui-live-basic only for UI projects when uiAnalysis is enabled', () => {
    const uiFp = makeFingerprint({ uiFramework: 'react', appType: 'vite-react' });
    const planWithUI = generateReviewPlan(uiFp, { uiAnalysis: true });
    expect(planWithUI.stages.map(s => s.id)).toContain('ui-live-basic');
    expect(planWithUI.includesUI).toBe(true);

    const planWithoutUI = generateReviewPlan(uiFp, { uiAnalysis: false });
    expect(planWithoutUI.stages.map(s => s.id)).not.toContain('ui-live-basic');

    const nonUIFp = makeFingerprint({ uiFramework: 'unknown', appType: 'unknown' });
    const planNonUI = generateReviewPlan(nonUIFp, { uiAnalysis: true });
    expect(planNonUI.stages.map(s => s.id)).not.toContain('ui-live-basic');
  });

  it('marks includesPython for Python projects', () => {
    const pyFp = makeFingerprint({ languages: ['python'], appType: 'fastapi' });
    const plan = generateReviewPlan(pyFp);
    expect(plan.includesPython).toBe(true);
  });

  it('marks includesSecurity when security stage is planned', () => {
    const fp = makeFingerprint({});
    const planDeep = generateReviewPlan(fp, { deepAnalysis: true });
    expect(planDeep.includesSecurity).toBe(true);
  });

  it('always ends with the report stage', () => {
    const fp = makeFingerprint({});
    const plan = generateReviewPlan(fp);
    expect(plan.stages[plan.stages.length - 1].id).toBe('report');
  });

  it('assigns incrementing order numbers', () => {
    const fp = makeFingerprint({ buildCommands: ['npm run build'], testCommands: ['npm run test'] });
    const plan = generateReviewPlan(fp);
    for (let i = 0; i < plan.stages.length; i++) {
      expect(plan.stages[i].order).toBe(i);
    }
  });

  it('returns a parsable plan summary', () => {
    const fp = makeFingerprint({ buildCommands: ['npm run build'] });
    const plan = generateReviewPlan(fp);
    const summary = formatPlanSummary(plan);
    expect(summary).toContain('## Review Plan');
    expect(summary).toContain('Stage');
    expect(summary).toContain('Reason');
  });
});

// ── Finding creation tests ───────────────────────────────────────────────────

describe('createFinding', () => {
  it('creates a finding with all required fields', () => {
    const evidence = createCodeEvidence('/src/app.ts', 'const x = 1;');
    const finding = createFinding({
      title: 'Unused variable',
      severity: 'low',
      category: 'maintainability',
      explanation: 'The variable x is declared but never used',
      evidence: [evidence],
      fixable: 'auto',
      confidence: confidence(95),
    });
    expect(finding.id).toBeDefined();
    expect(finding.title).toBe('Unused variable');
    expect(finding.severity).toBe('low');
    expect(finding.confidence).toBe(95);
    expect(finding.fixable).toBe('auto');
    expect(finding.tags).toEqual([]);
  });

  it('throws if evidence is empty', () => {
    expect(() =>
      createFinding({
        title: 'No evidence',
        severity: 'info',
        category: 'project',
        explanation: 'This should throw',
        evidence: [],
        fixable: 'none',
        confidence: confidence(50),
      })
    ).toThrow();
  });

  it('auto-assigns id if not provided', () => {
    const finding = createFinding({
      title: 'Test', severity: 'info', category: 'project',
      explanation: 'x', evidence: [createCodeEvidence('a.ts', 'x')],
      fixable: 'none', confidence: confidence(50),
    });
    expect(finding.id).toMatch(/^fnd-/);
  });
});

describe('createCommandEvidence', () => {
  it('captures stdout and exit code', () => {
    const ev = createCommandEvidence('npm test', 'PASS  foo.test.ts', 0);
    expect(ev.type).toBe('command-log');
    expect(ev.command).toBe('npm test');
    expect(ev.exitCode).toBe(0);
    expect(ev.timestamp).toBeDefined();
  });

  it('truncates long output', () => {
    const long = 'x'.repeat(3000);
    const ev = createCommandEvidence('npm run build', long, 0);
    expect((ev.excerpt?.length ?? 0)).toBeLessThan(3000);
    expect(ev.excerpt).toContain('…[truncated]');
  });
});

describe('createMetricEvidence', () => {
  it('captures numeric metrics', () => {
    const ev = createMetricEvidence(85, '%', 'Code coverage');
    expect(ev.type).toBe('metric');
    expect(ev.value).toBe(85);
    expect(ev.unit).toBe('%');
    expect(ev.label).toBe('Code coverage');
  });
});
