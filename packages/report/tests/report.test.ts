/**
 * @turpan/report — tests
 *
 * Covers:
 *   1. MarkdownReportWriter — snapshot test
 *   2. JsonReportWriter     — JSON schema shape + completeness
 *   3. ScorecardWriter      — score derivation
 *   4. HtmlReportWriter     — HTML generation + structure
 *   5. EvidenceIndexWriter  — graceful missing-artifact handling
 *   6. FixPlanWriter        — missing fixRunResult → placeholder text
 *   7. RunSummaryWriter     — next actions derivation
 *   8. Missing artifacts    — writers must not throw
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync }  from 'fs';
import { join }                              from 'path';
import { tmpdir }                            from 'os';

import { MarkdownReportWriter }  from '../src/MarkdownReportWriter.js';
import { HtmlReportWriter }      from '../src/HtmlReportWriter.js';
import { JsonReportWriter }      from '../src/JsonReportWriter.js';
import { ScorecardWriter }       from '../src/ScorecardWriter.js';
import { EvidenceIndexWriter }   from '../src/EvidenceIndexWriter.js';
import { FixPlanWriter }         from '../src/FixPlanWriter.js';
import { RunSummaryWriter }      from '../src/RunSummaryWriter.js';
import { deriveVerdict, type TurpanAnalysisData } from '../src/index.js';
import type { Finding }          from '@turpan/core';
import type { Scorecard }        from '@turpan/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `turpan-report-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeMinimalData(runPath: string): TurpanAnalysisData {
  return {
    runId:      'test-run-001',
    runPath,
    timestamp:  new Date().toISOString(),
    duration:   1234,
    findings:   [],
    scorecard:  { overall: 100, categories: { correctness: 100, security: 100, performance: 100, maintainability: 100, codeCoverage: 100 }, findingsCount: 0, criticalIssues: 0 },
    fingerprint: { projectName: 'test-project', languages: ['TypeScript'] },
    verdict:    'GO',
  };
}

function makeDataWithFindings(runPath: string): TurpanAnalysisData {
  const findings: Finding[] = [
    {
      id: 'fnd-001', title: 'Hardcoded secret detected', severity: 'critical',
      category: 'security', explanation: 'A hardcoded API key was found in the codebase.',
      file: 'src/auth.ts', line: 42,
      evidence: [{ type: 'code', label: 'secret-line', excerpt: "apiKey = 'sk-1234'" }],
      fixable: 'manual', confidence: 95, tags: [],
    },
    {
      id: 'fnd-002', title: 'Unused dependency', severity: 'low',
      category: 'dead-code', explanation: 'Package lodash is imported but never used.',
      file: 'src/utils.ts', line: 1,
      evidence: [{ type: 'command-log', label: 'depcheck', excerpt: 'lodash: unused' }],
      fixable: 'auto', confidence: 90, tags: [],
    },
  ];
  return {
    runId:      'test-run-002',
    runPath,
    timestamp:  new Date().toISOString(),
    duration:   5000,
    findings,
    scorecard:  { overall: 72, categories: { correctness: 72, security: 50, performance: 90, maintainability: 80, codeCoverage: 70 }, findingsCount: 2, criticalIssues: 1 },
    fingerprint: { projectName: 'test-project', languages: ['TypeScript'] },
    verdict:    'NO_GO',
  };
}

// ─── deriveVerdict ────────────────────────────────────────────────────────────

describe('deriveVerdict', () => {
  const scorecard = (overall: number): Scorecard =>
    ({ overall, categories: { correctness: overall, security: overall, performance: overall, maintainability: overall, codeCoverage: overall }, findingsCount: 0, criticalIssues: 0 });

  it('returns NO_GO when critical findings exist', () => {
    const findings: Finding[] = [{ id: '1', title: 'x', severity: 'critical', category: 'security', explanation: 'x', evidence: [{ type: 'code', excerpt: 'x' }], fixable: 'none', confidence: 95, tags: [] }];
    expect(deriveVerdict(scorecard(100), findings)).toBe('NO_GO');
  });

  it('returns CONDITIONAL_GO when high findings exist', () => {
    const findings: Finding[] = [{ id: '1', title: 'x', severity: 'high', category: 'security', explanation: 'x', evidence: [{ type: 'code', excerpt: 'x' }], fixable: 'none', confidence: 95, tags: [] }];
    expect(deriveVerdict(scorecard(100), findings)).toBe('CONDITIONAL_GO');
  });

  it('returns CONDITIONAL_GO when overall < 70', () => {
    expect(deriveVerdict(scorecard(69), [])).toBe('CONDITIONAL_GO');
  });

  it('returns GO when score >= 90 and no high+ issues', () => {
    expect(deriveVerdict(scorecard(90), [])).toBe('GO');
    expect(deriveVerdict(scorecard(100), [])).toBe('GO');
  });

  it('returns INTERNAL_ONLY otherwise', () => {
    expect(deriveVerdict(scorecard(70), [])).toBe('INTERNAL_ONLY');
    expect(deriveVerdict(scorecard(85), [])).toBe('INTERNAL_ONLY');
  });
});

// ─── MarkdownReportWriter ─────────────────────────────────────────────────────

describe('MarkdownReportWriter', () => {
  it('writes a file to runPath/TURPAN_ANALYSIS.md', async () => {
    const dir = makeTempDir();
    const writer = new MarkdownReportWriter(makeMinimalData(dir));
    const dest = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_ANALYSIS.md'));
  });

  it('contains required sections', async () => {
    const dir = makeTempDir();
    const content = new MarkdownReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('# Turpan Analysis');
    expect(content).toContain('## Verdict');
    expect(content).toContain('## Executive Summary');
    expect(content).toContain('## Project Fingerprint');
    expect(content).toContain('## Scorecard');
    expect(content).toContain('## Evidence Index');
  });

  it('renders GO verdict correctly', async () => {
    const dir  = makeTempDir();
    const data = makeMinimalData(dir);
    const content = new MarkdownReportWriter(data).render();
    expect(content).toContain('GO');
  });

  it('renders NO_GO with critical findings', async () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const content = new MarkdownReportWriter(data).render();
    expect(content).toContain('NO_GO');
    expect(content).toContain('Hardcoded secret detected');
    expect(content).toContain('src/auth.ts:42');
  });

  it('renders findings sorted by severity section', async () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const content = new MarkdownReportWriter(data).render();
    const ci = content.indexOf('## Critical Findings');
    const hi = content.indexOf('## High Findings');
    const mi = content.indexOf('## Medium Findings');
    const li = content.indexOf('## Low Findings');
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(hi).toBeGreaterThan(ci);
    // Medium section exists (with placeholder when empty)
    expect(mi).toBeGreaterThan(hi);
    // Low section follows medium
    expect(li).toBeGreaterThan(mi);
  });

  it('renders scorecard table', async () => {
    const dir  = makeTempDir();
    const content = new MarkdownReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('| **Overall** | **100/100** |');
  });

  it('renders project fingerprint', async () => {
    const dir  = makeTempDir();
    const data = makeMinimalData(dir);
    const content = new MarkdownReportWriter(data).render();
    expect(content).toContain('test-project');
    expect(content).toContain('TypeScript');
  });

  it('does not crash when run dir is empty', async () => {
    const dir  = makeTempDir();
    const writer = new MarkdownReportWriter(makeMinimalData(dir));
    const dest = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_ANALYSIS.md'));
  });
});

// ─── JsonReportWriter ─────────────────────────────────────────────────────────

describe('JsonReportWriter', () => {
  it('produces valid JSON', async () => {
    const dir = makeTempDir();
    const writer = new JsonReportWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    const content = await import('fs').then(fs => fs.readFileSync(dest, 'utf-8'));
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('contains required top-level fields', async () => {
    const dir = makeTempDir();
    const obj = new JsonReportWriter(makeMinimalData(dir)).build();
    expect(obj).toHaveProperty('version');
    expect(obj).toHaveProperty('runId');
    expect(obj).toHaveProperty('verdict');
    expect(obj).toHaveProperty('total');
    expect(obj).toHaveProperty('breakdown');
    expect(obj).toHaveProperty('findings');
  });

  it('breakdown sums to total', async () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const obj  = new JsonReportWriter(data).build();
    const sum  = obj.breakdown.critical + obj.breakdown.high + obj.breakdown.medium + obj.breakdown.low + obj.breakdown.info;
    expect(sum).toBe(obj.total);
  });

  it('serialises finding evidence correctly', async () => {
    const dir  = makeTempDir();
    const obj  = new JsonReportWriter(makeDataWithFindings(dir)).build();
    const f    = obj.findings[0];
    expect(f.evidence).toBeInstanceOf(Array);
    expect(f.evidence[0]).toHaveProperty('type');
    expect(f.evidence[0]).toHaveProperty('excerpt');
  });

  it('writes to TURPAN_FINDINGS.json', async () => {
    const dir = makeTempDir();
    const writer = new JsonReportWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_FINDINGS.json'));
  });
});

// ─── ScorecardWriter ──────────────────────────────────────────────────────────

describe('ScorecardWriter', () => {
  it('writes TURPAN_SCORECARD.json', async () => {
    const dir = makeTempDir();
    const writer = new ScorecardWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_SCORECARD.json'));
  });

  it('derives architecture score from findings', async () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const obj  = new ScorecardWriter(data).build();
    expect(obj.dimensions.architecture).toBeDefined();
    expect(typeof obj.dimensions.architecture.score).toBe('number');
  });

  it('derives release readiness from finding counts', async () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir); // has 1 critical → score should be 0
    const obj  = new ScorecardWriter(data).build();
    expect(obj.dimensions.releaseReadiness.score).toBeLessThan(100);
  });

  it('derives dead code score', async () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const obj  = new ScorecardWriter(data).build();
    expect(obj.dimensions.deadCode.score).toBeLessThanOrEqual(100);
  });

  it('has all required dimension keys', async () => {
    const dir  = makeTempDir();
    const obj  = new ScorecardWriter(makeMinimalData(dir)).build();
    const required = ['overall', 'buildHealth', 'testHealth', 'codeQuality', 'security',
                      'uiRuntime', 'uiQuality', 'architecture', 'deadCode', 'agentOutput', 'releaseReadiness'];
    for (const k of required) {
      expect(obj.dimensions).toHaveProperty(k);
    }
  });
});

// ─── HtmlReportWriter ─────────────────────────────────────────────────────────

describe('HtmlReportWriter', () => {
  it('writes TURPAN_ANALYSIS.html', async () => {
    const dir = makeTempDir();
    const writer = new HtmlReportWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_ANALYSIS.html'));
  });

  it('is valid HTML with DOCTYPE and closing tags', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('</html>');
    expect(content).toContain('<head>');
    expect(content).toContain('<body>');
  });

  it('contains verdict class for CSS styling', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('class="verdict GO"');
  });

  it('contains scorecard grid cells', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('scorecard-cell');
    expect(content).toContain('Overall');
  });

  it('contains findings list', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeDataWithFindings(dir)).render();
    expect(content).toContain('Hardcoded secret detected');
    expect(content).toContain('data-sev="critical"');
  });

  it('contains severity filter chips', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('filter-chip');
    expect(content).toContain('data-sev="critical"');
  });

  it('contains script for filter interactivity', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('filter-chip');
    expect(content).toContain('addEventListener');
  });

  it('contains collapsible evidence', async () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeMinimalData(dir)).render();
    expect(content).toContain('collapsible');
  });
});

// ─── EvidenceIndexWriter ──────────────────────────────────────────────────────

describe('EvidenceIndexWriter', () => {
  it('writes TURPAN_EVIDENCE_INDEX.md', async () => {
    const dir = makeTempDir();
    const writer = new EvidenceIndexWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_EVIDENCE_INDEX.md'));
  });

  it('gracefully handles missing run directory', async () => {
    const dir     = makeTempDir();
    const missing = join(dir, 'nonexistent-run');
    const writer  = new EvidenceIndexWriter(makeMinimalData(missing));
    // build() uses try/catch internally — must not throw
    expect(() => writer.build()).not.toThrow();
    const index = writer.build();
    expect(index.logs).toBeInstanceOf(Array);
  });

  it('build() returns categorised EvidenceIndex', async () => {
    const dir    = makeTempDir();
    const writer = new EvidenceIndexWriter(makeMinimalData(dir));
    const index  = writer.build();
    expect(index).toHaveProperty('logs');
    expect(index).toHaveProperty('screenshots');
    expect(index).toHaveProperty('traces');
    expect(index).toHaveProperty('jsonFiles');
    expect(index).toHaveProperty('patchFiles');
    expect(index).toHaveProperty('other');
  });
});

// ─── FixPlanWriter ────────────────────────────────────────────────────────────

describe('FixPlanWriter', () => {
  it('writes TURPAN_FIX_PLAN.md', async () => {
    const dir = makeTempDir();
    const writer = new FixPlanWriter(makeMinimalData(dir));
    const { fixPlanPath } = await writer.write(dir);
    expect(fixPlanPath).toBe(join(dir, 'TURPAN_FIX_PLAN.md'));
  });

  it('produces placeholder text when no fixRunResult', async () => {
    const dir     = makeTempDir();
    const content = new FixPlanWriter(makeMinimalData(dir)).render();
    expect(content).toContain('No fix run recorded');
  });

  it('does not write patch diff when no patch content', async () => {
    const dir  = makeTempDir();
    const writer = new FixPlanWriter(makeMinimalData(dir));
    const { patchPath } = await writer.write(dir);
    expect(patchPath).toBeUndefined();
  });
});

// ─── RunSummaryWriter ─────────────────────────────────────────────────────────

describe('RunSummaryWriter', () => {
  it('writes TURPAN_RUN_SUMMARY.json', async () => {
    const dir = makeTempDir();
    const writer = new RunSummaryWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_RUN_SUMMARY.json'));
  });

  it('has required fields', async () => {
    const dir = makeTempDir();
    const obj  = new RunSummaryWriter(makeMinimalData(dir)).build();
    expect(obj).toHaveProperty('version');
    expect(obj).toHaveProperty('runId');
    expect(obj).toHaveProperty('verdict');
    expect(obj).toHaveProperty('overallScore');
    expect(obj).toHaveProperty('findings');
    expect(obj).toHaveProperty('scorecard');
    expect(obj).toHaveProperty('fingerprint');
    expect(obj).toHaveProperty('nextActions');
  });

  it('derives next actions from critical findings', async () => {
    const dir  = makeTempDir();
    const obj  = new RunSummaryWriter(makeDataWithFindings(dir)).build();
    expect(obj.nextActions.some(a => a.priority === 'critical')).toBe(true);
  });

  it('derives next actions from clean run', async () => {
    const dir  = makeTempDir();
    const obj  = new RunSummaryWriter(makeMinimalData(dir)).build();
    expect(obj.nextActions.some(a => a.priority === 'low' && a.action.includes('release'))).toBe(true);
  });

  it('hasFixResult is false when no fixRunResult', async () => {
    const dir = makeTempDir();
    const obj  = new RunSummaryWriter(makeMinimalData(dir)).build();
    expect(obj.hasFixResult).toBe(false);
  });
});

// ─── Missing artifacts never crash writers ────────────────────────────────────

describe('Missing artifacts', () => {
  it('MarkdownReportWriter writes empty report when run dir missing', async () => {
    const dir  = makeTempDir();
    rmSync(dir, { recursive: true });
    const writer = new MarkdownReportWriter(makeMinimalData('/nonexistent/path'));
    const dest   = await writer.write(dir);
    expect(dest).toBe(join(dir, 'TURPAN_ANALYSIS.md'));
  });

  it('HtmlReportWriter writes valid HTML with no findings', async () => {
    const dir = makeTempDir();
    const writer = new HtmlReportWriter(makeMinimalData(dir));
    const dest   = await writer.write(dir);
    const content = await import('fs').then(fs => fs.readFileSync(dest, 'utf-8'));
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('</html>');
  });

  it('JsonReportWriter writes empty findings array', async () => {
    const dir = makeTempDir();
    const obj  = new JsonReportWriter(makeMinimalData(dir)).build();
    expect(obj.findings).toEqual([]);
    expect(obj.total).toBe(0);
  });

  it('ScorecardWriter handles zero-score scorecard', async () => {
    const dir  = makeTempDir();
    const data = makeMinimalData(dir);
    data.scorecard.overall = 0;
    const obj = new ScorecardWriter(data).build();
    expect(obj.overall).toBe(0);
    // Release readiness derives from finding counts (all 0 here) = 100
    expect(typeof obj.dimensions.releaseReadiness.score).toBe('number');
  });
});

// ─── Snapshot test — MarkdownReportWriter ─────────────────────────────────────

describe('MarkdownReportWriter snapshot', () => {
  it('matches known output for a full-data run', () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const content = new MarkdownReportWriter(data).render();

    // Structural assertions — these are the stable contract of the markdown output
    expect(content).toMatch(/^# Turpan Analysis$/m);
    expect(content).toMatch(/^## Verdict$/m);
    expect(content).toMatch(/^## Executive Summary$/m);
    expect(content).toMatch(/^## Project Fingerprint$/m);
    expect(content).toMatch(/^## Scorecard$/m);
    expect(content).toMatch(/^## Critical Findings$/m);
    expect(content).toMatch(/^## High Findings$/m);
    expect(content).toMatch(/^## Medium Findings$/m);
    expect(content).toMatch(/^## Low Findings$/m);
    expect(content).toMatch(/^## Evidence Index$/m);

    // Finding content
    expect(content).toContain('Hardcoded secret detected');
    expect(content).toContain('src/auth.ts:42');
    expect(content).toContain('NO_GO');

    // Scorecard renders
    expect(content).toContain('| **Overall** | **72/100** |');

    // Project fingerprint renders
    expect(content).toContain('test-project');

    // Severity order: Critical before High
    const ci = content.indexOf('## Critical Findings');
    const hi = content.indexOf('## High Findings');
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(hi).toBeGreaterThan(ci);
  });

  it('snapshot: clean GO run matches expected structure', () => {
    const dir  = makeTempDir();
    const data = makeMinimalData(dir);
    const content = new MarkdownReportWriter(data).render();
    // A clean run has a stable shape — verify it renders without crash
    expect(content).toMatch(/^# Turpan Analysis$/m);
    expect(content).toMatch(/^## Verdict$/m);
    expect(content).toMatch(/## Executive Summary/);
    expect(content).toMatch(/^## Scorecard$/m);
    expect(content).toMatch(/^## Evidence Index$/m);
    // Severity sections render with placeholder text for zero-finding runs
    expect(content).toMatch(/^## Critical Findings$/m);
    expect(content).toMatch(/^## High Findings$/m);
    expect(content).toMatch(/No critical severity findings/);
    expect(content).toMatch(/No high severity findings/);
  });
});

// ─── Dependency Audit section ────────────────────────────────────────────

function makeDataWithDependencyAudit(runPath: string, mode: 'online' | 'offline' = 'offline'): TurpanAnalysisData {
  return {
    ...makeMinimalData(runPath),
    dependencyAudit: {
      mode,
      sbomPath: `runs/test-run-001/sbom.json`,
      sbomCdxPath: `runs/test-run-001/sbom.cdx.json`,
      componentCount: 5,
      directCount: 3,
      transitiveCount: 2,
      vulnerabilities: [
        {
          name: 'lodash',
          version: '4.17.18',
          severity: 'critical',
          cveId: 'CVE-2019-10744',
          title: 'Lodash prototype pollution via merge',
          source: 'direct',
          exploitedInWild: true,
        },
        {
          name: 'minimist',
          version: '1.2.5',
          severity: 'critical',
          cveId: 'CVE-2021-44906',
          title: 'minimist prototype pollution (transitive)',
          source: 'transitive',
          exploitedInWild: false,
        },
      ],
      licenses: [
        {
          name: 'some-gpl-pkg',
          license: 'GPL-3.0',
          risk: 'high',
          policyViolation: true,
          reason: 'License "GPL-3.0" is explicitly disallowed by your dependencyAudit.licensePolicy.',
        },
        {
          name: 'some-unknown-pkg',
          license: 'CUSTOM-LICENSE',
          risk: 'medium',
          policyViolation: false,
          reason: 'License "CUSTOM-LICENSE" is not recognized as an OSI-approved license.',
        },
      ],
      errors: [],
      limitations: [
        'Offline mode uses only the bundled vulnerability database.',
      ],
    },
  };
}

describe('Dependency Audit report section', () => {
  it('renders Dependency Audit section in markdown', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeDataWithDependencyAudit(dir)).render();
    expect(content).toMatch(/^## Dependency Audit$/m);
    expect(content).toContain('📦 OFFLINE');
    expect(content).toContain('sbom.json');
    expect(content).toContain('sbom.cdx.json');
    expect(content).toContain('lodash');
    expect(content).toContain('CVE-2019-10744');
    expect(content).toContain('minimist');
    expect(content).toContain('GPL-3.0');
    expect(content).toContain('exploited');
    expect(content).toContain('Limitations');
  });

  it('shows ONLINE mode when audit was online', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeDataWithDependencyAudit(dir, 'online')).render();
    expect(content).toContain('🌐 ONLINE');
  });

  it('renders Dependency Audit section in HTML', () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeDataWithDependencyAudit(dir)).render();
    expect(content).toContain('<h2>Dependency Audit</h2>');
    expect(content).toContain('Internal SBOM');
    expect(content).toContain('CycloneDX SBOM');
    expect(content).toContain('lodash');
    expect(content).toContain('CRITICAL');
    expect(content).toContain('some-gpl-pkg');
  });

  it('omits Dependency Audit section when no audit data', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeMinimalData(dir)).render();
    expect(content).not.toContain('## Dependency Audit');
  });

  it('inventory counts are rendered', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeDataWithDependencyAudit(dir)).render();
    expect(content).toContain('Total components:');
    expect(content).toContain('5');
    expect(content).toContain('Direct deps:');
    expect(content).toContain('3');
    expect(content).toContain('Transitive deps:');
    expect(content).toContain('2');
  });

  it('separates license violations from warnings', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeDataWithDependencyAudit(dir)).render();
    expect(content).toContain('Policy violations (1):');
    expect(content).toContain('Warnings (1):');
  });
});

// ─── Phase 27: Authenticated SaaS Review section ────────────────────────────

function makeDataWithAuthenticatedSaas(runPath: string, enabled: boolean): TurpanAnalysisData {
  return {
    ...makeMinimalData(runPath),
    authenticatedSaas: {
      testUserEnabled: enabled,
      loginStatus: 'passed',
      protectedRouteBehavior: 'redirected',
      dashboardUsability: 'usable',
      settingsBehavior: 'wired',
      billingBehavior: 'wired',
      adminAccess: 'protected',
      authStatePath: 'runs/test-run-001/ui/auth-state.json',
      scenarioArtifactPaths: {
        auth: 'runs/test-run-001/ui/scenario-auth.json',
        dashboard: 'runs/test-run-001/ui/scenario-dashboard-authenticated.json',
        settings: 'runs/test-run-001/ui/scenario-settings.json',
        billing: 'runs/test-run-001/ui/scenario-billing-test-mode.json',
        admin: 'runs/test-run-001/ui/scenario-admin.json',
      },
      limitations: [
        'Test credentials are for isolated QA accounts only.',
        'Real payments and destructive actions are never executed.',
      ],
    },
  };
}

describe('Authenticated SaaS Review report section (Phase 27)', () => {
  it('renders Authenticated SaaS Review section when testUser enabled', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeDataWithAuthenticatedSaas(dir, true)).render();
    expect(content).toMatch(/^## Authenticated SaaS Review$/m);
    expect(content).toContain('ENABLED');
    expect(content).toContain('Login Status');
    expect(content).toContain('Dashboard Usability');
    expect(content).toContain('Settings Behavior');
    expect(content).toContain('Billing Test Mode');
    expect(content).toContain('auth-state.json');
    expect(content).toContain('Limitations');
  });

  it('renders dry-run mode when testUser disabled', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeDataWithAuthenticatedSaas(dir, false)).render();
    expect(content).toMatch(/^## Authenticated SaaS Review$/m);
    expect(content).toContain('DISABLED');
    expect(content).toContain('dry-run');
  });

  it('renders section in HTML', () => {
    const dir     = makeTempDir();
    const content = new HtmlReportWriter(makeDataWithAuthenticatedSaas(dir, true)).render();
    expect(content).toContain('<h2>Authenticated SaaS Review</h2>');
    expect(content).toContain('auth-state.json');
  });

  it('omits section when no authenticated SaaS data', () => {
    const dir     = makeTempDir();
    const content = new MarkdownReportWriter(makeMinimalData(dir)).render();
    expect(content).not.toContain('## Authenticated SaaS Review');
  });
});


// ─── JSON schema validation ───────────────────────────────────────────────────

describe('JsonReportWriter schema validation', () => {
  function assertSchema(obj: ReturnType<JsonReportWriter['build']>) {
    // Required top-level fields
    expect(obj).toHaveProperty('version');
    expect(obj).toHaveProperty('runId');
    expect(obj).toHaveProperty('timestamp');
    expect(obj).toHaveProperty('projectPath');
    expect(obj).toHaveProperty('verdict');
    expect(obj).toHaveProperty('total');
    expect(obj).toHaveProperty('breakdown');
    expect(obj).toHaveProperty('findings');

    // Version must be semver-like
    expect(obj.version).toMatch(/^\d+\.\d+\.\d+$/);

    // Verdict must be a known value
    expect(['GO', 'CONDITIONAL_GO', 'NO_GO', 'INTERNAL_ONLY']).toContain(obj.verdict);

    // Breakdown counts sum to total
    const sum = obj.breakdown.critical + obj.breakdown.high +
                obj.breakdown.medium + obj.breakdown.low + obj.breakdown.info;
    expect(sum).toBe(obj.total);

    // Each finding has required fields
    for (const f of obj.findings) {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('title');
      expect(f).toHaveProperty('severity');
      expect(f).toHaveProperty('category');
      expect(f).toHaveProperty('explanation');
      expect(f).toHaveProperty('fixable');
      expect(f).toHaveProperty('confidence');
      expect(f).toHaveProperty('tags');
      expect(f).toHaveProperty('evidence');
      expect(f.severity).toMatch(/^(critical|high|medium|low|info)$/);
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(100);
      expect(f.tags).toBeInstanceOf(Array);
      expect(f.evidence).toBeInstanceOf(Array);
    }
  }

  it('full-data run passes schema validation', () => {
    const dir  = makeTempDir();
    const data = makeDataWithFindings(dir);
    const obj  = new JsonReportWriter(data).build();
    assertSchema(obj);
  });

  it('minimal run passes schema validation', () => {
    const dir  = makeTempDir();
    const obj  = new JsonReportWriter(makeMinimalData(dir)).build();
    assertSchema(obj);
  });

  it('findings count matches breakdown total', () => {
    const dir  = makeTempDir();
    const obj  = new JsonReportWriter(makeDataWithFindings(dir)).build();
    expect(obj.findings.length).toBe(obj.total);
  });
});