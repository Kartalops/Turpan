/**
 * MarkdownReportWriter — produces TURPAN_ANALYSIS.md
 *
 * Structure mirrors the Turpan Analysis spec exactly:
 *   Verdict → Executive Summary → Project Fingerprint → Scorecard →
 *   Critical / High / Medium / Low Findings →
 *   Live UI Review → Code Quality Review → Security Review →
 *   Agent Output Audit → Fix Plan → Validation Results → Evidence Index
 */

import { join }             from 'path';
import { createRequire }    from 'module';
import type {
  TurpanAnalysisData,
  Verdict,
  EvidenceFile,
} from './types.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export class MarkdownReportWriter {
  constructor(private data: TurpanAnalysisData) {}

  /** Write the markdown report and return the file path written. */
  async write(runPath: string): Promise<string> {
    const { mkdirSync, writeFileSync } = await import('fs');
    const content = this.render();
    mkdirSync(runPath, { recursive: true });
    const dest = join(runPath, 'TURPAN_ANALYSIS.md');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  render(): string {
    const d = this.data;
    const lines: string[] = [];

    lines.push('# Turpan Analysis', '');
    lines.push(...this.verdictSection());
    lines.push(...this.executiveSummary());
    lines.push(...this.projectFingerprint());
    lines.push(...this.scorecardSection());
    lines.push(...this.findingsBySeverity('critical', d.findings));
    lines.push(...this.findingsBySeverity('high',     d.findings));
    lines.push(...this.findingsBySeverity('medium',   d.findings));
    lines.push(...this.findingsBySeverity('low',      d.findings));

    if (d.uiReview)      lines.push(...this.liveUiReview());
    if (d.codeQuality)   lines.push(...this.codeQualityReview());
    if (d.security)      lines.push(...this.securityReview());
    if (d.dependencyAudit) lines.push(...this.dependencyAuditSection());
    if (d.authenticatedSaas) lines.push(...this.authenticatedSaasSection());
    if (d.agentAudit)    lines.push(...this.agentOutputAudit());

    if (d.fixRunResult)  lines.push(...this.fixPlan());
    if (d.validation)    lines.push(...this.validationResults());
    if (d.fixRunResult)  lines.push(...this.patchSection());
    if (d.diffReview)   lines.push(...this.diffReviewSection());

    lines.push(...this.evidenceIndex());

    return lines.join('\n');
  }

  // ─── Verdict ───────────────────────────────────────────────────────────────

  private verdictSection(): string[] {
    const { verdict } = this.data;
    const badge = verdictBadge(verdict);
    const emoji = verdict === 'GO' ? '✅' : verdict === 'CONDITIONAL_GO' ? '⚠️' : verdict === 'NO_GO' ? '❌' : '🔒';
    return [
      '## Verdict', '',
      `${emoji} **${badge}**`, '',
    ];
  }

  // ─── Executive Summary ─────────────────────────────────────────────────────

  private executiveSummary(): string[] {
    const { findings, scorecard, verdict } = this.data;
    const lines: string[] = ['## Executive Summary', ''];

    const critical = findings.filter(f => f.severity === 'critical').length;
    const high     = findings.filter(f => f.severity === 'high').length;
    const medium   = findings.filter(f => f.severity === 'medium').length;

    if (verdict === 'GO') {
      lines.push(`- ✅ **GO** — project passes all critical checks with score ${scorecard.overall}/100`);
    } else if (verdict === 'CONDITIONAL_GO') {
      lines.push(`- ⚠️ **CONDITIONAL_GO** — project has ${high} high and ${medium} medium severity findings that should be addressed`);
    } else if (verdict === 'NO_GO') {
      lines.push(`- ❌ **NO_GO** — project has ${critical} critical findings that must be resolved before release`);
    } else {
      lines.push(`- 🔒 **INTERNAL_ONLY** — project is not ready for external deployment`);
    }

    lines.push(`- Overall score: **${scorecard.overall}/100`);

    if (critical > 0) lines.push(`- 🔴 ${critical} critical finding${critical !== 1 ? 's' : ''} require${critical === 1 ? 's' : ''} immediate attention`);
    if (high > 0)     lines.push(`- 🟠 ${high} high severity finding${high !== 1 ? 's' : ''} should be addressed before release`);
    if (medium > 0)   lines.push(`- 🟡 ${medium} medium severity finding${medium !== 1 ? 's' : ''} planned for next sprint`);
    if (findings.length === 0) lines.push('- ✅ No findings — clean run');

    if (scorecard.categories)
      lines.push(`- Build health: **${scorecard.categories.correctness ?? scorecard.overall}/100**`);
    if (scorecard.categories)
      lines.push(`- Security posture: **${scorecard.categories.security ?? scorecard.overall}/100**`);
    if (scorecard.categories)
      lines.push(`- Maintainability: **${scorecard.categories.maintainability ?? scorecard.overall}/100**`);

    lines.push('');
    return lines;
  }

  // ─── Project Fingerprint ───────────────────────────────────────────────────

  private projectFingerprint(): string[] {
    const { fingerprint } = this.data;
    const fp = fingerprint ?? {};
    const lines: string[] = [
      '## Project Fingerprint', '',
      '| Property | Value |', '|---------|-------|',
    ];

    const pairs: Array<[string, string]> = [
      ['Project Name',     String(fp['projectName']   ?? fp['name']      ?? 'unknown')],
      ['App Type',         String(fp['appType']       ?? fp['projectType'] ?? 'unknown')],
      ['Languages',        (fp['languages'] as string[] ?? []).join(', ') || 'unknown'],
      ['Package Manager',  String(fp['packageManager'] ?? fp['pkgManager'] ?? 'unknown')],
      ['UI Framework',     String(fp['uiFramework']   ?? fp['ui']         ?? 'unknown')],
      ['Backend Framework',String(fp['backendFramework'] ?? fp['backend'] ?? 'unknown')],
      ['Test Tools',       (fp['testTools'] as string[] ?? []).join(', ') || 'unknown'],
      ['Commands',         (fp['commands'] as string[] ?? []).join(', ') || 'none detected'],
      ['Routes',           (fp['routes']   as string[] ?? []).join(', ') || 'none detected'],
      ['Runtime',          String(fp['runtime'] ?? 'Node.js')],
      ['Report Version',   this.data.runId],
    ];

    for (const [k, v] of pairs) lines.push(`| ${k} | ${v} |`);
    lines.push('');
    return lines;
  }

  // ─── Scorecard ─────────────────────────────────────────────────────────────

  private scorecardSection(): string[] {
    const { scorecard, findings } = this.data;
    const lines: string[] = ['## Scorecard', '', '| Dimension | Score |', '|-----------|-------|'];

    const overall = scorecard.overall ?? 0;
    lines.push(`| **Overall** | **${overall}/100** |`);

    if (scorecard.categories) {
      const c = scorecard.categories;
      lines.push(
        `| Build Health       | ${c.correctness    ?? overall}/100 |`,
        `| Test Health        | ${c.codeCoverage   ?? overall}/100 |`,
        `| Code Quality       | ${c.maintainability ?? overall}/100 |`,
        `| Security           | ${c.security       ?? overall}/100 |`,
        `| Performance        | ${c.performance    ?? overall}/100 |`,
      );
    }

    // Findings breakdown
    lines.push('', '| Finding Severity | Count |', '|-----------------|-------|');
    const counts = severityCounts(findings);
    lines.push(
      `| 🔴 Critical | ${counts.critical} |`,
      `| 🟠 High     | ${counts.high} |`,
      `| 🟡 Medium   | ${counts.medium} |`,
      `| 🟢 Low      | ${counts.low} |`,
      `| 🔵 Info     | ${counts.info} |`,
    );
    lines.push('');
    return lines;
  }

  // ─── Findings by Severity ──────────────────────────────────────────────────

  private findingsBySeverity(
    severity: 'critical' | 'high' | 'medium' | 'low',
    findings: import('@turpan/core').Finding[]
  ): string[] {
    const filtered = findings.filter(f => f.severity === severity);
    const label    = severity.charAt(0).toUpperCase() + severity.slice(1);
    const lines: string[] = [
      `## ${label} Findings`,
      '',
      filtered.length === 0
        ? `_No ${label.toLowerCase()} severity findings._`
        : '',
    ];

    for (const finding of filtered) {
      lines.push(`### ${finding.title}`, '');
      if (finding.file) lines.push(`**File:** \`${finding.file}${finding.line ? `:${finding.line}` : ''}\``);
      if (finding.command) lines.push(`**Command:** \`${finding.command}\``);
      lines.push('');
      lines.push(finding.explanation, '');
      if (finding.suggestedFix) {
        lines.push('**Suggested Fix:**', '');
        lines.push(finding.suggestedFix, '');
      }
      if (finding.evidence.length > 0) {
        lines.push('**Evidence:**', '');
        for (const ev of finding.evidence) {
          const label  = ev.label   ?? ev.type;
          const excerpt = ev.excerpt ?? '';
          if (ev.path) {
            lines.push(`- \`${label}\`: [${ev.path}](file://${ev.path})${excerpt ? ` — ${excerpt}` : ''}`);
          } else if (excerpt) {
            lines.push(`- \`${label}\`: ${excerpt}`);
          }
        }
      }
      lines.push('');
    }

    return lines;
  }

  // ─── Live UI Review ────────────────────────────────────────────────────────

  private liveUiReview(): string[] {
    const { uiReview } = this.data;
    if (!uiReview) return [];
    const lines: string[] = ['## Live UI Review', ''];

    lines.push(`**Routes tested:** ${uiReview.routesTested.length > 0 ? uiReview.routesTested.join(', ') : '_none_'}`);
    lines.push('');

    if (uiReview.screenshots.length > 0) {
      lines.push('**Screenshots:**', '');
      for (const ss of uiReview.screenshots) {
        lines.push(`- \`${ss.route}\`: ![${ss.label ?? ss.route}](${ss.path})`);
      }
      lines.push('');
    }

    if (uiReview.consoleErrors.length > 0) {
      lines.push('**Console Errors:**', '');
      for (const ce of uiReview.consoleErrors) {
        lines.push(`- \`${ce.route}\`: ${ce.message} (×${ce.count})`);
      }
      lines.push('');
    } else {
      lines.push('**Console Errors:** ✅ None', '');
    }

    if (uiReview.networkErrors.length > 0) {
      lines.push('**Network Errors:**', '');
      for (const ne of uiReview.networkErrors) {
        lines.push(`- \`${ne.route}\` [${ne.status}] ${ne.url} (×${ne.count})`);
      }
      lines.push('');
    } else {
      lines.push('**Network Errors:** ✅ None', '');
    }

    if (uiReview.interactionFindings.length > 0) {
      lines.push('**Interaction Findings:**', '');
      for (const f of uiReview.interactionFindings) lines.push(`- ${f}`);
      lines.push('');
    }

    if (uiReview.mobileFindings.length > 0) {
      lines.push('**Mobile Findings:**', '');
      for (const f of uiReview.mobileFindings) lines.push(`- ${f}`);
      lines.push('');
    }

    return lines;
  }

  // ─── Code Quality Review ───────────────────────────────────────────────────

  private codeQualityReview(): string[] {
    const { codeQuality } = this.data;
    if (!codeQuality) return [];
    const lines: string[] = ['## Code Quality Review', ''];

    const sections: Array<[string, string[]]> = [
      ['Maintainability',        codeQuality.maintainability],
      ['Dead Code',              codeQuality.deadCode],
      ['Duplicate Code',         codeQuality.duplicateCode],
      ['Complexity',             codeQuality.complexity],
      ['Unused Dependencies',    codeQuality.unusedDependencies],
    ];

    for (const [title, items] of sections) {
      lines.push(`### ${title}`, '');
      if (items.length === 0) {
        lines.push(`_No ${title.toLowerCase()} issues detected._`, '');
      } else {
        for (const item of items) lines.push(`- ${item}`);
        lines.push('');
      }
    }

    return lines;
  }

  // ─── Security Review ───────────────────────────────────────────────────────

  private securityReview(): string[] {
    const { security } = this.data;
    if (!security) return [];
    const lines: string[] = ['## Security Review', ''];

    const sections: Array<[string, string[]]> = [
      ['Secrets',          security.secrets],
      ['Authentication',   security.auth],
      ['CORS',             security.cors],
      ['Injection Risks',  security.injectionRisks],
      ['MCP/Tool Risks',   security.mcpToolRisks],
    ];

    for (const [title, items] of sections) {
      lines.push(`### ${title}`, '');
      if (items.length === 0) {
        lines.push(`_No ${title.toLowerCase()} issues detected._`, '');
      } else {
        for (const item of items) lines.push(`- ${item}`);
        lines.push('');
      }
    }

    return lines;
  }

  // ─── Dependency Audit ────────────────────────────────────────────────────────

  private authenticatedSaasSection(): string[] {
    const sa = this.data.authenticatedSaas;
    if (!sa) return [];
    const lines: string[] = ['## Authenticated SaaS Review', ''];

    // Test user status
    const testUserBadge = sa.testUserEnabled ? '✅ ENABLED' : '⚠️ DISABLED';
    lines.push(`**Test User Mode:** ${testUserBadge}`, '');

    if (!sa.testUserEnabled) {
      lines.push('_Authenticated scenarios ran in dry-run mode. Login forms were inspected but NOT submitted._', '');
      lines.push('To enable real seeded login, set `ui.testUser.enabled: true` in `turpan.yml` with a test user account.', '');
      lines.push('### Limitations', '');
      for (const lim of sa.limitations) lines.push(`- ${lim}`);
      lines.push('');
      return lines;
    }

    // Login status
    lines.push('### Login Status', '');
    const loginBadge = sa.loginStatus === 'passed' ? '✅ PASSED'
      : sa.loginStatus === 'failed' ? '❌ FAILED'
      : sa.loginStatus === 'warn' ? '⚠️ WARN'
      : sa.loginStatus === 'skipped' ? '⏭️ SKIPPED'
      : '❓ NOT_RUN';
    lines.push(`- **Login:** ${loginBadge}`);
    lines.push(`- **Protected Routes:** ${sa.protectedRouteBehavior}`);
    lines.push(`- **Admin Access (unauth):** ${sa.adminAccess}`);
    lines.push('');

    // Dashboard
    lines.push('### Dashboard Usability', '');
    const dashBadge = sa.dashboardUsability === 'usable' ? '✅ USABLE'
      : sa.dashboardUsability === 'partially_usable' ? '⚠️ PARTIALLY USABLE'
      : sa.dashboardUsability === 'empty' ? '❌ EMPTY'
      : sa.dashboardUsability === 'broken' ? '❌ BROKEN'
      : '❓ UNKNOWN';
    lines.push(`- **Dashboard:** ${dashBadge}`);
    lines.push('');

    // Settings
    lines.push('### Settings Behavior', '');
    const setBadge = sa.settingsBehavior === 'wired' ? '✅ WIRED'
      : sa.settingsBehavior === 'noop_save' ? '⚠️ NO-OP SAVE'
      : sa.settingsBehavior === 'destructive_actions_detected' ? '⚠️ DESTRUCTIVE ACTIONS DETECTED'
      : '❓ UNKNOWN';
    lines.push(`- **Settings:** ${setBadge}`);
    lines.push('');

    // Billing
    lines.push('### Billing Test Mode', '');
    const billBadge = sa.billingBehavior === 'wired' ? '✅ WIRED'
      : sa.billingBehavior === 'fake_success' ? '⚠️ FAKE SUCCESS DETECTED'
      : sa.billingBehavior === 'test_mode_disabled' ? '⏭️ TEST MODE DISABLED'
      : '❓ UNKNOWN';
    lines.push(`- **Billing:** ${billBadge}`);
    lines.push('');

    // Artifacts
    lines.push('### Artifacts', '');
    lines.push(`- \`${sa.authStatePath}\` — Auth state metadata (NO secrets)`);
    lines.push(`- \`${sa.scenarioArtifactPaths.auth}\` — Auth scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.dashboard}\` — Authenticated dashboard scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.settings}\` — Settings scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.billing}\` — Billing test mode scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.admin}\` — Admin scenario`);
    lines.push('');

    // Limitations
    lines.push('### Limitations', '');
    for (const lim of sa.limitations) lines.push(`- ${lim}`);
    lines.push('');

    return lines;
  }

  // ─── Dependency Audit ────────────────────────────────────────────────────────

  private dependencyAuditSection(): string[] {
    const da = this.data.dependencyAudit;
    if (!da) return [];
    const lines: string[] = ['## Dependency Audit', ''];

    // Mode + SBOM paths
    const modeBadge = da.mode === 'online' ? '🌐 ONLINE' : '📦 OFFLINE';
    lines.push(`**Mode:** ${modeBadge}`, '');
    lines.push('**Artifacts:**', '');
    lines.push(`- Internal SBOM: \`${da.sbomPath}\``);
    lines.push(`- CycloneDX SBOM: \`${da.sbomCdxPath}\``);
    lines.push('');

    // Inventory summary
    lines.push('### Inventory', '');
    lines.push(`- **Total components:** ${da.componentCount}`);
    lines.push(`- **Direct deps:** ${da.directCount}`);
    lines.push(`- **Transitive deps:** ${da.transitiveCount}`);
    lines.push('');

    // Vulnerabilities table
    lines.push('### Vulnerabilities', '');
    if (da.vulnerabilities.length === 0) {
      lines.push('_No known vulnerabilities found._', '');
    } else {
      lines.push('| Package | Version | Severity | CVE | Source | Title |');
      lines.push('|---------|---------|----------|-----|--------|-------|');
      for (const v of da.vulnerabilities) {
        const sev = v.severity.toUpperCase();
        const sevEmoji = v.severity === 'critical' ? '🔴'
          : v.severity === 'high' ? '🟠'
          : v.severity === 'medium' ? '🟡'
          : '🔵';
        const exploited = v.exploitedInWild ? ' ⚠️ exploited' : '';
        const cve = v.cveId ?? '—';
        const safeTitle = v.title.replace(/\|/g, '\\|').replace(/`/g, '\\`');
        lines.push(`| \`${v.name}\` | \`${v.version}\` | ${sevEmoji} ${sev} | ${cve} | ${v.source} | ${safeTitle}${exploited} |`);
      }
      lines.push('');
    }

    // Licenses table
    lines.push('### License Audit', '');
    const violations = da.licenses.filter(l => l.policyViolation);
    const warnings = da.licenses.filter(l => !l.policyViolation && l.risk !== 'none');

    if (da.licenses.length === 0) {
      lines.push('_No license issues detected._', '');
    } else if (violations.length === 0 && warnings.length === 0) {
      lines.push('_All dependencies have permissive licenses._', '');
    } else {
      if (violations.length > 0) {
        lines.push(`**Policy violations (${violations.length}):**`, '');
        lines.push('| Package | License | Risk | Reason |');
        lines.push('|---------|---------|------|--------|');
        for (const l of violations) {
          const lic = (l.license ?? '(missing)').replace(/\|/g, '\\|');
          const reason = l.reason.replace(/\|/g, '\\|').slice(0, 120);
          lines.push(`| \`${l.name}\` | ${lic} | 🔴 HIGH | ${reason} |`);
        }
        lines.push('');
      }
      if (warnings.length > 0) {
        lines.push(`**Warnings (${warnings.length}):**`, '');
        lines.push('| Package | License | Risk | Reason |');
        lines.push('|---------|---------|------|--------|');
        for (const l of warnings) {
          const lic = (l.license ?? '(missing)').replace(/\|/g, '\\|');
          const risk = l.risk === 'high' ? '🟠 HIGH'
            : l.risk === 'medium' ? '🟡 MEDIUM'
            : l.risk === 'low' ? '🔵 LOW' : '—';
          const reason = l.reason.replace(/\|/g, '\\|').slice(0, 120);
          lines.push(`| \`${l.name}\` | ${lic} | ${risk} | ${reason} |`);
        }
        lines.push('');
      }
    }

    // Errors (offline fallback, timeouts, etc.)
    if (da.errors.length > 0) {
      lines.push('### Audit Errors', '');
      for (const e of da.errors) lines.push(`- ⚠️ ${e}`);
      lines.push('');
    }

    // Limitations (honesty section)
    lines.push('### Limitations', '');
    if (da.limitations.length === 0) {
      lines.push('_None._', '');
    } else {
      for (const lim of da.limitations) lines.push(`- ${lim}`);
      lines.push('');
    }

    return lines;
  }

  // ─── Agent Output Audit ────────────────────────────────────────────────────

  private agentOutputAudit(): string[] {
    const { agentAudit } = this.data;
    if (!agentAudit) return [];
    const lines: string[] = ['## Agent Output Audit', ''];

    const score = agentAudit.completionScore;
    const bar   = renderScoreBar(score);
    const rec   = agentAudit.recommendation ?? 'UNKNOWN';
    const conf  = (agentAudit as any).confidenceLevel ?? 'medium';
    const verdictColor = rec === 'READY' ? '🟢' : rec === 'READY_WITH_LIMITATIONS' ? '🟡' : rec === 'NOT_READY' ? '🔴' : '⚫';

    lines.push(`**Completion Score:** ${bar} **${score}/100**  ${verdictColor} **${rec}**  (confidence: ${conf})`, '');
    lines.push(`| Severity | Count |`, `|---------|-------|`);
    lines.push(
      `| 🔴 Critical | ${agentAudit.issuesCount?.critical ?? 0} |`,
      `| 🟠 High     | ${agentAudit.issuesCount?.high ?? 0} |`,
      `| 🟡 Medium   | ${agentAudit.issuesCount?.medium ?? 0} |`,
      `| 🟢 Low      | ${agentAudit.issuesCount?.low ?? 0} |`,
    );
    lines.push('');

    lines.push('### Requested Capabilities', '');
    if (agentAudit.requestedCapabilities.length === 0) {
      lines.push('_No specific capabilities detected in task._');
    } else {
      for (const c of agentAudit.requestedCapabilities) lines.push(`- \`${c}\``);
    }
    lines.push('');
    lines.push('### Implemented Capabilities', '');
    if (agentAudit.implementedCapabilities.length === 0) {
      lines.push('_None detected._');
    } else {
      for (const c of agentAudit.implementedCapabilities) lines.push(`- \`${c}\``);
    }
    lines.push('');
    lines.push('### Missing Capabilities', '');
    if (agentAudit.missingCapabilities.length === 0) {
      lines.push('_None — all requested capabilities are implemented._');
    } else {
      for (const c of agentAudit.missingCapabilities) lines.push(`- \`${c}\``);
    }
    lines.push('');
    lines.push('### Fake / Shallow Implementations', '');
    if (agentAudit.fakeShallowImpls.length === 0) {
      lines.push('_None detected._');
    } else {
      for (const c of agentAudit.fakeShallowImpls) lines.push(`- \`${c}\``);
    }
    lines.push('');
    return lines;
  }

  // ─── Fix Plan ──────────────────────────────────────────────────────────────

  private fixPlan(): string[] {
    const { fixRunResult } = this.data;
    if (!fixRunResult) return [];

    const candidates = fixRunResult.patchResult.filesModified.map((file, i) => ({
      id:          `fix-${i}`,
      description: `Patch: ${file}`,
      filePath:    file,
      risk:        'low' as const,
    }));

    const lines: string[] = ['## Fix Plan', ''];

    // Safe
    const safe = fixRunResult.applied.filter(r => r.decision === 'applied');
    lines.push('### Safe Fixes', '');
    if (safe.length === 0) {
      lines.push('_No safe fixes applied._', '');
    } else {
      for (const r of safe) {
        lines.push(`- ✅ \`${r.candidateId}\` — applied`);
        if (r.validation) {
          const status = r.validation.allPassed ? '✅ passed' : '❌ failed';
          lines.push(`  - Validation: ${status} (${r.validation.totalDurationMs}ms)`);
        }
      }
      lines.push('');
    }

    // Risky
    const risky = fixRunResult.rejected.filter(r =>
      r.rejectionReason !== 'user-declined' && r.rejectionReason !== 'unknown-file'
    );
    lines.push('### Risky Fixes', '');
    if (risky.length === 0) {
      lines.push('_No risky fixes rejected._', '');
    } else {
      for (const r of risky) {
        lines.push(`- ⚠️ \`${r.candidateId}\` — rejected: \`${r.rejectionReason}\``);
      }
      lines.push('');
    }

    // Deferred
    const deferred = fixRunResult.deferred;
    lines.push('### Deferred Fixes', '');
    if (deferred.length === 0) {
      lines.push('_No deferred fixes._', '');
    } else {
      for (const r of deferred) {
        lines.push(`- ⏳ \`${r.candidateId}\` — deferred`);
      }
      lines.push('');
    }

    return lines;
  }

  // ─── Validation Results ────────────────────────────────────────────────────

  private validationResults(): string[] {
    const { validation } = this.data;
    if (!validation) return [];
    const lines: string[] = ['## Validation Results', ''];

    const checks: Array<[string, typeof validation.build]> = [
      ['Build',      validation.build],
      ['Test',       validation.test],
      ['Lint',       validation.lint],
      ['Typecheck',  validation.typecheck],
      ['UI',         validation.ui],
    ];

    for (const [label, check] of checks) {
      if (!check) continue;
      const icon = check.passed ? '✅' : '❌';
      lines.push(`### ${label} ${icon}`, '');
      lines.push(`- Duration: ${check.durationMs}ms`);
      if (check.output) lines.push('', '```', check.output, '```');
      if (check.error)  lines.push(`- Error: ${check.error}`);
      lines.push('');
    }

    return lines;
  }

  // ─── Patch Section ─────────────────────────────────────────────────────────

  private patchSection(): string[] {
    const { fixRunResult } = this.data;
    if (!fixRunResult?.patchResult?.patchContent) return [];
    const lines: string[] = [
      '## Patch Diff',
      '',
      '```diff',
      fixRunResult.patchResult.patchContent,
      '```',
      '',
    ];
    return lines;
  }

  // ─── Diff Review ────────────────────────────────────────────────────────────

  private diffReviewSection(): string[] {
    const { diffReview } = this.data;
    if (!diffReview) return [];
    const lines: string[] = ['## Diff Review', ''];

    const decisionIcon =
      diffReview.recommendation === 'approve' ? '✅' :
      diffReview.recommendation === 'request_changes' ? '⚠️' : '❌';

    lines.push(`**Comparison:** \`${diffReview.baseRef}\` → \`${diffReview.targetRef}\``, '');
    lines.push(`**Recommendation:** ${decisionIcon} **${diffReview.recommendation.replace('_', ' ').toUpperCase()}** (confidence: ${diffReview.confidence})`, '');
    lines.push('');
    lines.push(diffReview.summary, '');
    lines.push('');

    // Changed files summary
    lines.push('### Changed Files', '');
    lines.push(diffReview.changedFilesSummary, '');
    lines.push('');

    // Risk by file
    if (diffReview.riskByFile.length > 0) {
      lines.push('### Risk by File', '');
      lines.push('| File | Risk |', '|------|------|');
      for (const rf of diffReview.riskByFile) {
        const riskIcon = rf.risk === 'critical' ? '🔴' : rf.risk === 'high' ? '🟠' : rf.risk === 'medium' ? '🟡' : '🟢';
        lines.push(`| \`${rf.file}\` | ${riskIcon} ${rf.risk} |`);
      }
      lines.push('');
    }

    // Changed routes
    if (diffReview.changedRoutes.length > 0) {
      lines.push('### Changed Routes', '');
      for (const r of diffReview.changedRoutes) lines.push(`- \`${r}\``);
      lines.push('');
    }

    // Changed APIs
    if (diffReview.changedApis.length > 0) {
      lines.push('### Changed APIs', '');
      for (const a of diffReview.changedApis) lines.push(`- \`${a}\``);
      lines.push('');
    }

    // Findings introduced by diff
    if (diffReview.findingsIntroducedByDiff.length > 0) {
      lines.push('### Findings Introduced by Diff', '');
      for (const f of diffReview.findingsIntroducedByDiff) lines.push(`- ${f}`);
      lines.push('');
    }

    // Pre-existing findings ignored
    if (diffReview.preExistingFindingsIgnored.length > 0) {
      lines.push('### Pre-existing Findings Ignored (Diff Mode)', '');
      lines.push('_The following findings were suppressed because they are not related to changed files:_', '');
      for (const f of diffReview.preExistingFindingsIgnored) lines.push(`- ${f}`);
      lines.push('');
    }

    lines.push('---', '');
    return lines;
  }

  // ─── Evidence Index ────────────────────────────────────────────────────────

  private evidenceIndex(): string[] {
    const { runPath, findings } = this.data;
    const lines: string[] = ['## Evidence Index', ''];

    const evidenceFiles = this.gatherEvidenceFiles(runPath);

    const categories: Array<[string, EvidenceFile[]]> = [
      ['Logs',        evidenceFiles.filter(f => f.kind === 'log')],
      ['Screenshots', evidenceFiles.filter(f => f.kind === 'screenshot')],
      ['Traces',      evidenceFiles.filter(f => f.kind === 'trace')],
      ['JSON Files',  evidenceFiles.filter(f => f.kind === 'json')],
      ['Patch Files', evidenceFiles.filter(f => f.kind === 'patch')],
      ['Other',       evidenceFiles.filter(f => f.kind === 'other')],
    ];

    for (const [label, files] of categories) {
      if (files.length === 0) continue;
      lines.push(`### ${label}`, '');
      for (const f of files) {
        const sizeKb = f.size > 0 ? `(${(f.size / 1024).toFixed(1)} KB)` : '';
        lines.push(`- [${f.label}](file://${f.path}) ${sizeKb}`);
      }
      lines.push('');
    }

    return lines;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private gatherEvidenceFiles(runPath: string): EvidenceFile[] {
    // Synchronous file gathering — run in try/catch so missing artifacts never crash
    try {
      // Dynamic import inside async method context — Node resolves this correctly
      const fs     = createRequire(import.meta.url)('fs');
      const { readdirSync, statSync } = fs;
      const files: EvidenceFile[] = [];
      const entries = readdirSync(runPath, { recursive: true }) as string[];
      for (const entry of entries) {
        const fullPath = join(runPath, entry);
        let size = 0;
        try { size = statSync(fullPath).size; } catch { /* skip */ }
        const kind = classifyFile(entry);
        if (kind) {
          files.push({ label: entry, path: fullPath, size, kind });
        }
      }
      return files;
    } catch {
      return [];
    }
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function verdictBadge(v: Verdict): string {
  return { GO: 'GO', CONDITIONAL_GO: 'CONDITIONAL_GO', NO_GO: 'NO_GO', INTERNAL_ONLY: 'INTERNAL_ONLY' }[v];
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

function classifyFile(path: string): string {
  const lc = path.toLowerCase();
  if (lc.endsWith('.log'))                          return 'log';
  if (lc.endsWith('.png') || lc.endsWith('.jpg'))  return 'screenshot';
  if (lc.endsWith('.trace') || lc.endsWith('.perf')) return 'trace';
  if (lc.endsWith('.json'))                         return 'json';
  if (lc.endsWith('.diff') || lc.endsWith('.patch')) return 'patch';
  return '';
}

function renderScoreBar(score: number): string {
  const filled  = Math.round(score / 10);
  const empty   = 10 - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}