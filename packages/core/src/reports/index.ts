import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { AnalysisResult, Scorecard } from '@turpan/shared';
import { createEmptyScorecard } from '../context/index.js';
import { formatSeverity } from '../findings/severity.js';

export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function generateMarkdownReport(result: AnalysisResult): string {
  const { scorecard, findings, fingerprint, timestamp, duration, projectPath } = result;
  const verdict = computeVerdictFromScorecard(scorecard);
  const severityCounts = countBySeverity(findings);

  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────
  lines.push('# Turpan Analysis Report');
  lines.push('');
  lines.push(`**Project:** ${projectPath}`);
  lines.push(`**Date:** ${timestamp}`);
  lines.push(`**Duration:** ${(duration / 1000).toFixed(1)}s`);
  lines.push('');

  // ── Verdict ─────────────────────────────────────────────────────────────
  lines.push('## Verdict');
  lines.push('');
  const verdictColor = verdict === 'GO' ? '✅ GO' : verdict === 'CONDITIONAL_GO' ? '⚠️ CONDITIONAL_GO' : verdict === 'INTERNAL_ONLY' ? '🔒 INTERNAL_ONLY' : '🚫 NO_GO';
  lines.push(`${verdictColor}`);
  lines.push('');

  // ── Scorecard ───────────────────────────────────────────────────────────
  lines.push('## Scorecard');
  lines.push('');
  lines.push(`| Dimension | Score |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| **Overall** | **${scorecard.overall}/100** |`);
  lines.push(`| Build Health | ${scorecard.categories.correctness}/100 |`);
  lines.push(`| Test Health | ${scorecard.categories.codeCoverage}/100 |`);
  lines.push(`| Code Quality | ${scorecard.categories.maintainability}/100 |`);
  lines.push(`| Security | ${scorecard.categories.security}/100 |`);
  lines.push(`| UI / Runtime | ${scorecard.categories.performance}/100 |`);
  lines.push('');
  lines.push(`| Finding Severity | Count |`);
  lines.push(`|-----------------|-------|`);
  lines.push(`| 🔴 Critical | ${severityCounts.critical ?? 0} |`);
  lines.push(`| 🟠 High | ${severityCounts.high ?? 0} |`);
  lines.push(`| 🟡 Medium | ${severityCounts.medium ?? 0} |`);
  lines.push(`| 🟢 Low | ${severityCounts.low ?? 0} |`);
  lines.push(`| 🔵 Info | ${severityCounts.info ?? 0} |`);
  lines.push('');

  // ── Project Fingerprint ─────────────────────────────────────────────────
  if (fingerprint) {
    const fp = fingerprint as Record<string, unknown>;
    lines.push('## Project Fingerprint');
    lines.push('');
    lines.push(`| Property | Value |`);
    lines.push(`|---------|-------|`);
    if (fp['projectName']) lines.push(`| Project Name | ${fp['projectName']} |`);
    if (fp['appType']) lines.push(`| App Type | ${fp['appType']} |`);
    if (fp['languages'] && Array.isArray(fp['languages'])) lines.push(`| Languages | ${(fp['languages'] as string[]).join(', ')} |`);
    if (fp['packageManager']) lines.push(`| Package Manager | ${fp['packageManager']} |`);
    if (fp['uiFramework']) lines.push(`| UI Framework | ${fp['uiFramework']} |`);
    if (fp['backendFramework']) lines.push(`| Backend Framework | ${fp['backendFramework']} |`);
    if (fp['testTools'] && Array.isArray(fp['testTools'])) lines.push(`| Test Tools | ${(fp['testTools'] as string[]).join(', ')} |`);
    lines.push('');
  }

  // ── Review Plan ─────────────────────────────────────────────────────────
  lines.push('## Review Plan');
  lines.push('');
  lines.push('| Stage |');
  lines.push('|-------|');
  lines.push('| project-fingerprint |');
  lines.push('| install-check |');
  lines.push('| script-detection |');
  lines.push('| build |');
  lines.push('| test |');
  lines.push('| lint |');
  lines.push('| typecheck |');
  if (result.config.deepAnalysis) {
    lines.push('| static-quality |');
    lines.push('| security-basic |');
    lines.push('| dead-code-basic |');
  }
  if (result.config.uiAnalysis) lines.push('| ui-live-basic |');
  lines.push('| report |');
  lines.push('');

  // ── Findings by Severity ────────────────────────────────────────────────
  lines.push('## Findings by Severity');
  lines.push('');
  if (findings.length === 0) {
    lines.push('_No findings — project looks clean!_');
    lines.push('');
  } else {
    const bySev = groupBySeverity(findings);
    for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
      const group = bySev[sev];
      if (!group || group.length === 0) continue;
      lines.push(`### ${formatSeverity(sev)} (${group.length})`);
      lines.push('');
      for (const f of group) {
        lines.push(`**${f.title}**`);
        lines.push(`- Category: ${f.category}  |  Location: \`${f.file ?? '(none)'}${f.line ? ':' + f.line : ''}\``);
        if (f.suggestedFix) lines.push(`- Fix: ${f.suggestedFix}`);
        lines.push(`- Confidence: ${f.confidence}%`);
        if (f.evidence.length > 0) {
          lines.push(`- Evidence: ${f.evidence[0].excerpt?.slice(0, 120) ?? f.evidence[0].type}`);
        }
        lines.push('');
      }
    }
  }

  // ── Findings by Category ────────────────────────────────────────────────
  if (findings.length > 0) {
    lines.push('## Findings by Category');
    lines.push('');
    const byCat = groupByCategory(findings);
    for (const [cat, catFindings] of Object.entries(byCat)) {
      lines.push(`### ${cat} (${catFindings.length})`);
      lines.push('');
      for (const f of catFindings) {
        lines.push(`- **[${f.severity.toUpperCase()}]** ${f.title} — \`${f.file ?? ''}${f.line ? ':' + f.line : ''}\``);
      }
      lines.push('');
    }
  }

  // ── Code Quality & Cleanup ──────────────────────────────────────────────
  const qualityCategories = ['maintainability', 'dead-code', 'dependency', 'agent-output', 'architecture'];
  const qualityFindings = findings.filter(f => qualityCategories.includes(f.category));
  const agentOutputFindings = findings.filter(f => f.category === 'agent-output');
  const deadCodeFindings = findings.filter(f => f.category === 'dead-code');
  const depFindings = findings.filter(f => f.category === 'dependency');
  const archFindings = findings.filter(f => f.category === 'architecture');
  const maintFindings = findings.filter(f => f.category === 'maintainability');

  if (qualityFindings.length > 0) {
    lines.push('## Code Quality & Cleanup');
    lines.push('');
    lines.push(`_Found ${qualityFindings.length} quality and cleanup-related findings across ${qualityCategories.join(', ')}_\n`);

    // Safe Cleanup Candidates
    const safeCategories = ['dependency'];
    const safeFindings = qualityFindings.filter(f => safeCategories.includes(f.category));
    if (safeFindings.length > 0) {
      lines.push('### ✅ Safe Cleanup Candidates');
      lines.push('');
      lines.push('_Likely safe to remove after verification:_\n');
      for (const f of safeFindings) {
        lines.push(`- **[${f.severity.toUpperCase()}]** \`${f.file ?? '(package.json)'}${f.line ? ':' + f.line : ''}\` — ${f.title}`);
        if (f.suggestedFix) lines.push(`  - Fix: ${f.suggestedFix}`);
      }
      lines.push('');
    }

    // Risky Cleanup Candidates
    const riskyCategories = ['dead-code', 'maintainability', 'architecture'];
    const riskyFindings = qualityFindings.filter(f => riskyCategories.includes(f.category));
    if (riskyFindings.length > 0) {
      lines.push('### ⚠️ Risky Cleanup Candidates');
      lines.push('');
      lines.push('_Require manual review before changes:_\n');
      for (const f of riskyFindings) {
        lines.push(`- **[${f.severity.toUpperCase()}]** \`${f.file ?? ''}${f.line ? ':' + f.line : ''}\` — ${f.title}`);
        if (f.suggestedFix) lines.push(`  - Fix: ${f.suggestedFix}`);
      }
      lines.push('');
    }

    // Agent-like Implementation Smells
    if (agentOutputFindings.length > 0) {
      lines.push('### 🤖 Agent-like Implementation Smells');
      lines.push('');
      lines.push('_Found patterns suggesting placeholder or AI-generated code:_\n');
      for (const f of agentOutputFindings) {
        lines.push(`- **[${f.severity.toUpperCase()}]** \`${f.file ?? ''}${f.line ? ':' + f.line : ''}\` — ${f.title}`);
        lines.push(`  - ${f.explanation}`);
        if (f.suggestedFix) lines.push(`  - Fix: ${f.suggestedFix}`);
      }
      lines.push('');
    }
  } else if (findings.length > 0) {
    lines.push('## Code Quality & Cleanup');
    lines.push('');
    lines.push('_No quality or cleanup findings from static analysis._\n');
  }

  // ── Evidence Index ──────────────────────────────────────────────────────
  const evidenceFiles = [...new Set(findings.flatMap(f => f.evidence.filter(e => e.path).map(e => e.path!)))];
  if (evidenceFiles.length > 0) {
    lines.push('## Evidence Index');
    lines.push('');
    lines.push(`_Total files referenced in evidence: ${evidenceFiles.length}_`);
    lines.push('');
    for (const ef of evidenceFiles) {
      lines.push(`- \`${ef}\``);
    }
    lines.push('');
  }

  // ── Next Actions ────────────────────────────────────────────────────────
  lines.push('## Next Actions');
  lines.push('');
  lines.push('1. **Verify findings**: Review each finding and confirm it is a real issue before cleanup');
  lines.push('2. **Safe cleanups first**: Remove unused dependencies (lowest risk)');
  lines.push('3. **Conservative refactoring**: For dead-code and architecture issues, add tests before changes');
  lines.push('4. **Re-run after cleanup**: Run `turpan review .` again to verify improvements');
  lines.push('');
  lines.push('---');
  lines.push('*Generated by Turpan*');

  return lines.join('\n');
}

export function generateJsonReport(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

export function generateScorecardReport(scorecard: Scorecard): string {
  return JSON.stringify(scorecard, null, 2);
}

export function writeReports(runPath: string, result: AnalysisResult): void {
  ensureDir(join(runPath, 'logs'));

  const mdReport = generateMarkdownReport(result);
  writeFileSync(join(runPath, 'TURPAN_ANALYSIS.md'), mdReport, 'utf-8');

  const jsonReport = generateJsonReport(result);
  writeFileSync(join(runPath, 'TURPAN_FINDINGS.json'), jsonReport, 'utf-8');

  const scorecardReport = generateScorecardReport(result.scorecard);
  writeFileSync(join(runPath, 'TURPAN_SCORECARD.json'), scorecardReport, 'utf-8');
}

export function writePlaceholderReports(runPath: string): void {
  const placeholderResult: AnalysisResult = {
    config: {
      version: '0.1.0',
      projectPath: runPath,
      runPath,
      deepAnalysis: false,
      uiAnalysis: false,
      fixMode: false,
      logLevel: 'info',
    },
    findings: [
      {
        id: 'placeholder-1',
        title: 'Placeholder: Real analysis not yet implemented',
        severity: 'info',
        category: 'project',
        explanation: 'This is a placeholder report. Real code analysis will be implemented in future phases.',
        fixable: 'none',
        confidence: 0,
        tags: ['placeholder'],
        evidence: [{ type: 'command-log', label: 'placeholder', excerpt: 'Placeholder — real evidence not yet collected', timestamp: new Date().toISOString() }],
      },
    ],
    scorecard: createEmptyScorecard(),
    timestamp: new Date().toISOString(),
    duration: 0,
    projectPath: runPath,
  };

  writeReports(runPath, placeholderResult);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeVerdictFromScorecard(scorecard: Scorecard): 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY' {
  if (scorecard.overall < 40) return 'NO_GO';
  if (scorecard.categories.security < 50) return 'NO_GO';
  if (scorecard.overall >= 75) return 'GO';
  return 'CONDITIONAL_GO';
}

function countBySeverity(findings: AnalysisResult['findings']) {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
  };
}

function groupBySeverity(findings: AnalysisResult['findings']) {
  const map: Record<string, typeof findings> = {};
  for (const f of findings) {
    (map[f.severity] ??= []).push(f);
  }
  return map;
}

function groupByCategory(findings: AnalysisResult['findings']) {
  const map: Record<string, typeof findings> = {};
  for (const f of findings) {
    (map[f.category] ??= []).push(f);
  }
  return map;
}
