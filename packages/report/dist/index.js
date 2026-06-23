// src/MarkdownReportWriter.ts
import { join } from "path";
import { createRequire } from "module";
var MarkdownReportWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  /** Write the markdown report and return the file path written. */
  async write(runPath) {
    const { mkdirSync: mkdirSync2, writeFileSync } = await import("fs");
    const content = this.render();
    mkdirSync2(runPath, { recursive: true });
    const dest = join(runPath, "TURPAN_ANALYSIS.md");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  // ─── Render ────────────────────────────────────────────────────────────────
  render() {
    const d = this.data;
    const lines = [];
    lines.push("# Turpan Analysis", "");
    lines.push(...this.verdictSection());
    lines.push(...this.executiveSummary());
    lines.push(...this.projectFingerprint());
    lines.push(...this.scorecardSection());
    lines.push(...this.findingsBySeverity("critical", d.findings));
    lines.push(...this.findingsBySeverity("high", d.findings));
    lines.push(...this.findingsBySeverity("medium", d.findings));
    lines.push(...this.findingsBySeverity("low", d.findings));
    if (d.uiReview) lines.push(...this.liveUiReview());
    if (d.codeQuality) lines.push(...this.codeQualityReview());
    if (d.security) lines.push(...this.securityReview());
    if (d.dependencyAudit) lines.push(...this.dependencyAuditSection());
    if (d.authenticatedSaas) lines.push(...this.authenticatedSaasSection());
    if (d.agentAudit) lines.push(...this.agentOutputAudit());
    if (d.fixRunResult) lines.push(...this.fixPlan());
    if (d.validation) lines.push(...this.validationResults());
    if (d.fixRunResult) lines.push(...this.patchSection());
    if (d.diffReview) lines.push(...this.diffReviewSection());
    lines.push(...this.evidenceIndex());
    return lines.join("\n");
  }
  // ─── Verdict ───────────────────────────────────────────────────────────────
  verdictSection() {
    const { verdict } = this.data;
    const badge = verdictBadge(verdict);
    const emoji = verdict === "GO" ? "\u2705" : verdict === "CONDITIONAL_GO" ? "\u26A0\uFE0F" : verdict === "NO_GO" ? "\u274C" : "\u{1F512}";
    return [
      "## Verdict",
      "",
      `${emoji} **${badge}**`,
      ""
    ];
  }
  // ─── Executive Summary ─────────────────────────────────────────────────────
  executiveSummary() {
    const { findings, scorecard, verdict } = this.data;
    const lines = ["## Executive Summary", ""];
    const critical = findings.filter((f) => f.severity === "critical").length;
    const high = findings.filter((f) => f.severity === "high").length;
    const medium = findings.filter((f) => f.severity === "medium").length;
    if (verdict === "GO") {
      lines.push(`- \u2705 **GO** \u2014 project passes all critical checks with score ${scorecard.overall}/100`);
    } else if (verdict === "CONDITIONAL_GO") {
      lines.push(`- \u26A0\uFE0F **CONDITIONAL_GO** \u2014 project has ${high} high and ${medium} medium severity findings that should be addressed`);
    } else if (verdict === "NO_GO") {
      lines.push(`- \u274C **NO_GO** \u2014 project has ${critical} critical findings that must be resolved before release`);
    } else {
      lines.push(`- \u{1F512} **INTERNAL_ONLY** \u2014 project is not ready for external deployment`);
    }
    lines.push(`- Overall score: **${scorecard.overall}/100`);
    if (critical > 0) lines.push(`- \u{1F534} ${critical} critical finding${critical !== 1 ? "s" : ""} require${critical === 1 ? "s" : ""} immediate attention`);
    if (high > 0) lines.push(`- \u{1F7E0} ${high} high severity finding${high !== 1 ? "s" : ""} should be addressed before release`);
    if (medium > 0) lines.push(`- \u{1F7E1} ${medium} medium severity finding${medium !== 1 ? "s" : ""} planned for next sprint`);
    if (findings.length === 0) lines.push("- \u2705 No findings \u2014 clean run");
    if (scorecard.categories)
      lines.push(`- Build health: **${scorecard.categories.correctness ?? scorecard.overall}/100**`);
    if (scorecard.categories)
      lines.push(`- Security posture: **${scorecard.categories.security ?? scorecard.overall}/100**`);
    if (scorecard.categories)
      lines.push(`- Maintainability: **${scorecard.categories.maintainability ?? scorecard.overall}/100**`);
    lines.push("");
    return lines;
  }
  // ─── Project Fingerprint ───────────────────────────────────────────────────
  projectFingerprint() {
    const { fingerprint } = this.data;
    const fp = fingerprint ?? {};
    const lines = [
      "## Project Fingerprint",
      "",
      "| Property | Value |",
      "|---------|-------|"
    ];
    const pairs = [
      ["Project Name", String(fp["projectName"] ?? fp["name"] ?? "unknown")],
      ["App Type", String(fp["appType"] ?? fp["projectType"] ?? "unknown")],
      ["Languages", (fp["languages"] ?? []).join(", ") || "unknown"],
      ["Package Manager", String(fp["packageManager"] ?? fp["pkgManager"] ?? "unknown")],
      ["UI Framework", String(fp["uiFramework"] ?? fp["ui"] ?? "unknown")],
      ["Backend Framework", String(fp["backendFramework"] ?? fp["backend"] ?? "unknown")],
      ["Test Tools", (fp["testTools"] ?? []).join(", ") || "unknown"],
      ["Commands", (fp["commands"] ?? []).join(", ") || "none detected"],
      ["Routes", (fp["routes"] ?? []).join(", ") || "none detected"],
      ["Runtime", String(fp["runtime"] ?? "Node.js")],
      ["Report Version", this.data.runId]
    ];
    for (const [k, v] of pairs) lines.push(`| ${k} | ${v} |`);
    lines.push("");
    return lines;
  }
  // ─── Scorecard ─────────────────────────────────────────────────────────────
  scorecardSection() {
    const { scorecard, findings } = this.data;
    const lines = ["## Scorecard", "", "| Dimension | Score |", "|-----------|-------|"];
    const overall = scorecard.overall ?? 0;
    lines.push(`| **Overall** | **${overall}/100** |`);
    if (scorecard.categories) {
      const c = scorecard.categories;
      lines.push(
        `| Build Health       | ${c.correctness ?? overall}/100 |`,
        `| Test Health        | ${c.codeCoverage ?? overall}/100 |`,
        `| Code Quality       | ${c.maintainability ?? overall}/100 |`,
        `| Security           | ${c.security ?? overall}/100 |`,
        `| Performance        | ${c.performance ?? overall}/100 |`
      );
    }
    lines.push("", "| Finding Severity | Count |", "|-----------------|-------|");
    const counts = severityCounts(findings);
    lines.push(
      `| \u{1F534} Critical | ${counts.critical} |`,
      `| \u{1F7E0} High     | ${counts.high} |`,
      `| \u{1F7E1} Medium   | ${counts.medium} |`,
      `| \u{1F7E2} Low      | ${counts.low} |`,
      `| \u{1F535} Info     | ${counts.info} |`
    );
    lines.push("");
    return lines;
  }
  // ─── Findings by Severity ──────────────────────────────────────────────────
  findingsBySeverity(severity, findings) {
    const filtered = findings.filter((f) => f.severity === severity);
    const label = severity.charAt(0).toUpperCase() + severity.slice(1);
    const lines = [
      `## ${label} Findings`,
      "",
      filtered.length === 0 ? `_No ${label.toLowerCase()} severity findings._` : ""
    ];
    for (const finding of filtered) {
      lines.push(`### ${finding.title}`, "");
      if (finding.file) lines.push(`**File:** \`${finding.file}${finding.line ? `:${finding.line}` : ""}\``);
      if (finding.command) lines.push(`**Command:** \`${finding.command}\``);
      lines.push("");
      lines.push(finding.explanation, "");
      if (finding.suggestedFix) {
        lines.push("**Suggested Fix:**", "");
        lines.push(finding.suggestedFix, "");
      }
      if (finding.evidence.length > 0) {
        lines.push("**Evidence:**", "");
        for (const ev of finding.evidence) {
          const label2 = ev.label ?? ev.type;
          const excerpt = ev.excerpt ?? "";
          if (ev.path) {
            lines.push(`- \`${label2}\`: [${ev.path}](file://${ev.path})${excerpt ? ` \u2014 ${excerpt}` : ""}`);
          } else if (excerpt) {
            lines.push(`- \`${label2}\`: ${excerpt}`);
          }
        }
      }
      lines.push("");
    }
    return lines;
  }
  // ─── Live UI Review ────────────────────────────────────────────────────────
  liveUiReview() {
    const { uiReview } = this.data;
    if (!uiReview) return [];
    const lines = ["## Live UI Review", ""];
    lines.push(`**Routes tested:** ${uiReview.routesTested.length > 0 ? uiReview.routesTested.join(", ") : "_none_"}`);
    lines.push("");
    if (uiReview.screenshots.length > 0) {
      lines.push("**Screenshots:**", "");
      for (const ss of uiReview.screenshots) {
        lines.push(`- \`${ss.route}\`: ![${ss.label ?? ss.route}](${ss.path})`);
      }
      lines.push("");
    }
    if (uiReview.consoleErrors.length > 0) {
      lines.push("**Console Errors:**", "");
      for (const ce of uiReview.consoleErrors) {
        lines.push(`- \`${ce.route}\`: ${ce.message} (\xD7${ce.count})`);
      }
      lines.push("");
    } else {
      lines.push("**Console Errors:** \u2705 None", "");
    }
    if (uiReview.networkErrors.length > 0) {
      lines.push("**Network Errors:**", "");
      for (const ne of uiReview.networkErrors) {
        lines.push(`- \`${ne.route}\` [${ne.status}] ${ne.url} (\xD7${ne.count})`);
      }
      lines.push("");
    } else {
      lines.push("**Network Errors:** \u2705 None", "");
    }
    if (uiReview.interactionFindings.length > 0) {
      lines.push("**Interaction Findings:**", "");
      for (const f of uiReview.interactionFindings) lines.push(`- ${f}`);
      lines.push("");
    }
    if (uiReview.mobileFindings.length > 0) {
      lines.push("**Mobile Findings:**", "");
      for (const f of uiReview.mobileFindings) lines.push(`- ${f}`);
      lines.push("");
    }
    return lines;
  }
  // ─── Code Quality Review ───────────────────────────────────────────────────
  codeQualityReview() {
    const { codeQuality } = this.data;
    if (!codeQuality) return [];
    const lines = ["## Code Quality Review", ""];
    const sections = [
      ["Maintainability", codeQuality.maintainability],
      ["Dead Code", codeQuality.deadCode],
      ["Duplicate Code", codeQuality.duplicateCode],
      ["Complexity", codeQuality.complexity],
      ["Unused Dependencies", codeQuality.unusedDependencies]
    ];
    for (const [title, items] of sections) {
      lines.push(`### ${title}`, "");
      if (items.length === 0) {
        lines.push(`_No ${title.toLowerCase()} issues detected._`, "");
      } else {
        for (const item of items) lines.push(`- ${item}`);
        lines.push("");
      }
    }
    return lines;
  }
  // ─── Security Review ───────────────────────────────────────────────────────
  securityReview() {
    const { security } = this.data;
    if (!security) return [];
    const lines = ["## Security Review", ""];
    const sections = [
      ["Secrets", security.secrets],
      ["Authentication", security.auth],
      ["CORS", security.cors],
      ["Injection Risks", security.injectionRisks],
      ["MCP/Tool Risks", security.mcpToolRisks]
    ];
    for (const [title, items] of sections) {
      lines.push(`### ${title}`, "");
      if (items.length === 0) {
        lines.push(`_No ${title.toLowerCase()} issues detected._`, "");
      } else {
        for (const item of items) lines.push(`- ${item}`);
        lines.push("");
      }
    }
    return lines;
  }
  // ─── Dependency Audit ────────────────────────────────────────────────────────
  authenticatedSaasSection() {
    const sa = this.data.authenticatedSaas;
    if (!sa) return [];
    const lines = ["## Authenticated SaaS Review", ""];
    const testUserBadge = sa.testUserEnabled ? "\u2705 ENABLED" : "\u26A0\uFE0F DISABLED";
    lines.push(`**Test User Mode:** ${testUserBadge}`, "");
    if (!sa.testUserEnabled) {
      lines.push("_Authenticated scenarios ran in dry-run mode. Login forms were inspected but NOT submitted._", "");
      lines.push("To enable real seeded login, set `ui.testUser.enabled: true` in `turpan.yml` with a test user account.", "");
      lines.push("### Limitations", "");
      for (const lim of sa.limitations) lines.push(`- ${lim}`);
      lines.push("");
      return lines;
    }
    lines.push("### Login Status", "");
    const loginBadge = sa.loginStatus === "passed" ? "\u2705 PASSED" : sa.loginStatus === "failed" ? "\u274C FAILED" : sa.loginStatus === "warn" ? "\u26A0\uFE0F WARN" : sa.loginStatus === "skipped" ? "\u23ED\uFE0F SKIPPED" : "\u2753 NOT_RUN";
    lines.push(`- **Login:** ${loginBadge}`);
    lines.push(`- **Protected Routes:** ${sa.protectedRouteBehavior}`);
    lines.push(`- **Admin Access (unauth):** ${sa.adminAccess}`);
    lines.push("");
    lines.push("### Dashboard Usability", "");
    const dashBadge = sa.dashboardUsability === "usable" ? "\u2705 USABLE" : sa.dashboardUsability === "partially_usable" ? "\u26A0\uFE0F PARTIALLY USABLE" : sa.dashboardUsability === "empty" ? "\u274C EMPTY" : sa.dashboardUsability === "broken" ? "\u274C BROKEN" : "\u2753 UNKNOWN";
    lines.push(`- **Dashboard:** ${dashBadge}`);
    lines.push("");
    lines.push("### Settings Behavior", "");
    const setBadge = sa.settingsBehavior === "wired" ? "\u2705 WIRED" : sa.settingsBehavior === "noop_save" ? "\u26A0\uFE0F NO-OP SAVE" : sa.settingsBehavior === "destructive_actions_detected" ? "\u26A0\uFE0F DESTRUCTIVE ACTIONS DETECTED" : "\u2753 UNKNOWN";
    lines.push(`- **Settings:** ${setBadge}`);
    lines.push("");
    lines.push("### Billing Test Mode", "");
    const billBadge = sa.billingBehavior === "wired" ? "\u2705 WIRED" : sa.billingBehavior === "fake_success" ? "\u26A0\uFE0F FAKE SUCCESS DETECTED" : sa.billingBehavior === "test_mode_disabled" ? "\u23ED\uFE0F TEST MODE DISABLED" : "\u2753 UNKNOWN";
    lines.push(`- **Billing:** ${billBadge}`);
    lines.push("");
    lines.push("### Artifacts", "");
    lines.push(`- \`${sa.authStatePath}\` \u2014 Auth state metadata (NO secrets)`);
    lines.push(`- \`${sa.scenarioArtifactPaths.auth}\` \u2014 Auth scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.dashboard}\` \u2014 Authenticated dashboard scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.settings}\` \u2014 Settings scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.billing}\` \u2014 Billing test mode scenario`);
    lines.push(`- \`${sa.scenarioArtifactPaths.admin}\` \u2014 Admin scenario`);
    lines.push("");
    lines.push("### Limitations", "");
    for (const lim of sa.limitations) lines.push(`- ${lim}`);
    lines.push("");
    return lines;
  }
  // ─── Dependency Audit ────────────────────────────────────────────────────────
  dependencyAuditSection() {
    const da = this.data.dependencyAudit;
    if (!da) return [];
    const lines = ["## Dependency Audit", ""];
    const modeBadge = da.mode === "online" ? "\u{1F310} ONLINE" : "\u{1F4E6} OFFLINE";
    lines.push(`**Mode:** ${modeBadge}`, "");
    lines.push("**Artifacts:**", "");
    lines.push(`- Internal SBOM: \`${da.sbomPath}\``);
    lines.push(`- CycloneDX SBOM: \`${da.sbomCdxPath}\``);
    lines.push("");
    lines.push("### Inventory", "");
    lines.push(`- **Total components:** ${da.componentCount}`);
    lines.push(`- **Direct deps:** ${da.directCount}`);
    lines.push(`- **Transitive deps:** ${da.transitiveCount}`);
    lines.push("");
    lines.push("### Vulnerabilities", "");
    if (da.vulnerabilities.length === 0) {
      lines.push("_No known vulnerabilities found._", "");
    } else {
      lines.push("| Package | Version | Severity | CVE | Source | Title |");
      lines.push("|---------|---------|----------|-----|--------|-------|");
      for (const v of da.vulnerabilities) {
        const sev = v.severity.toUpperCase();
        const sevEmoji = v.severity === "critical" ? "\u{1F534}" : v.severity === "high" ? "\u{1F7E0}" : v.severity === "medium" ? "\u{1F7E1}" : "\u{1F535}";
        const exploited = v.exploitedInWild ? " \u26A0\uFE0F exploited" : "";
        const cve = v.cveId ?? "\u2014";
        const safeTitle = v.title.replace(/\|/g, "\\|").replace(/`/g, "\\`");
        lines.push(`| \`${v.name}\` | \`${v.version}\` | ${sevEmoji} ${sev} | ${cve} | ${v.source} | ${safeTitle}${exploited} |`);
      }
      lines.push("");
    }
    lines.push("### License Audit", "");
    const violations = da.licenses.filter((l) => l.policyViolation);
    const warnings = da.licenses.filter((l) => !l.policyViolation && l.risk !== "none");
    if (da.licenses.length === 0) {
      lines.push("_No license issues detected._", "");
    } else if (violations.length === 0 && warnings.length === 0) {
      lines.push("_All dependencies have permissive licenses._", "");
    } else {
      if (violations.length > 0) {
        lines.push(`**Policy violations (${violations.length}):**`, "");
        lines.push("| Package | License | Risk | Reason |");
        lines.push("|---------|---------|------|--------|");
        for (const l of violations) {
          const lic = (l.license ?? "(missing)").replace(/\|/g, "\\|");
          const reason = l.reason.replace(/\|/g, "\\|").slice(0, 120);
          lines.push(`| \`${l.name}\` | ${lic} | \u{1F534} HIGH | ${reason} |`);
        }
        lines.push("");
      }
      if (warnings.length > 0) {
        lines.push(`**Warnings (${warnings.length}):**`, "");
        lines.push("| Package | License | Risk | Reason |");
        lines.push("|---------|---------|------|--------|");
        for (const l of warnings) {
          const lic = (l.license ?? "(missing)").replace(/\|/g, "\\|");
          const risk = l.risk === "high" ? "\u{1F7E0} HIGH" : l.risk === "medium" ? "\u{1F7E1} MEDIUM" : l.risk === "low" ? "\u{1F535} LOW" : "\u2014";
          const reason = l.reason.replace(/\|/g, "\\|").slice(0, 120);
          lines.push(`| \`${l.name}\` | ${lic} | ${risk} | ${reason} |`);
        }
        lines.push("");
      }
    }
    if (da.errors.length > 0) {
      lines.push("### Audit Errors", "");
      for (const e of da.errors) lines.push(`- \u26A0\uFE0F ${e}`);
      lines.push("");
    }
    lines.push("### Limitations", "");
    if (da.limitations.length === 0) {
      lines.push("_None._", "");
    } else {
      for (const lim of da.limitations) lines.push(`- ${lim}`);
      lines.push("");
    }
    return lines;
  }
  // ─── Agent Output Audit ────────────────────────────────────────────────────
  agentOutputAudit() {
    const { agentAudit } = this.data;
    if (!agentAudit) return [];
    const lines = ["## Agent Output Audit", ""];
    const score = agentAudit.completionScore;
    const bar = renderScoreBar(score);
    const rec = agentAudit.recommendation ?? "UNKNOWN";
    const conf = agentAudit.confidenceLevel ?? "medium";
    const verdictColor = rec === "READY" ? "\u{1F7E2}" : rec === "READY_WITH_LIMITATIONS" ? "\u{1F7E1}" : rec === "NOT_READY" ? "\u{1F534}" : "\u26AB";
    lines.push(`**Completion Score:** ${bar} **${score}/100**  ${verdictColor} **${rec}**  (confidence: ${conf})`, "");
    lines.push(`| Severity | Count |`, `|---------|-------|`);
    lines.push(
      `| \u{1F534} Critical | ${agentAudit.issuesCount?.critical ?? 0} |`,
      `| \u{1F7E0} High     | ${agentAudit.issuesCount?.high ?? 0} |`,
      `| \u{1F7E1} Medium   | ${agentAudit.issuesCount?.medium ?? 0} |`,
      `| \u{1F7E2} Low      | ${agentAudit.issuesCount?.low ?? 0} |`
    );
    lines.push("");
    lines.push("### Requested Capabilities", "");
    if (agentAudit.requestedCapabilities.length === 0) {
      lines.push("_No specific capabilities detected in task._");
    } else {
      for (const c of agentAudit.requestedCapabilities) lines.push(`- \`${c}\``);
    }
    lines.push("");
    lines.push("### Implemented Capabilities", "");
    if (agentAudit.implementedCapabilities.length === 0) {
      lines.push("_None detected._");
    } else {
      for (const c of agentAudit.implementedCapabilities) lines.push(`- \`${c}\``);
    }
    lines.push("");
    lines.push("### Missing Capabilities", "");
    if (agentAudit.missingCapabilities.length === 0) {
      lines.push("_None \u2014 all requested capabilities are implemented._");
    } else {
      for (const c of agentAudit.missingCapabilities) lines.push(`- \`${c}\``);
    }
    lines.push("");
    lines.push("### Fake / Shallow Implementations", "");
    if (agentAudit.fakeShallowImpls.length === 0) {
      lines.push("_None detected._");
    } else {
      for (const c of agentAudit.fakeShallowImpls) lines.push(`- \`${c}\``);
    }
    lines.push("");
    return lines;
  }
  // ─── Fix Plan ──────────────────────────────────────────────────────────────
  fixPlan() {
    const { fixRunResult } = this.data;
    if (!fixRunResult) return [];
    const candidates = fixRunResult.patchResult.filesModified.map((file, i) => ({
      id: `fix-${i}`,
      description: `Patch: ${file}`,
      filePath: file,
      risk: "low"
    }));
    const lines = ["## Fix Plan", ""];
    const safe = fixRunResult.applied.filter((r) => r.decision === "applied");
    lines.push("### Safe Fixes", "");
    if (safe.length === 0) {
      lines.push("_No safe fixes applied._", "");
    } else {
      for (const r of safe) {
        lines.push(`- \u2705 \`${r.candidateId}\` \u2014 applied`);
        if (r.validation) {
          const status = r.validation.allPassed ? "\u2705 passed" : "\u274C failed";
          lines.push(`  - Validation: ${status} (${r.validation.totalDurationMs}ms)`);
        }
      }
      lines.push("");
    }
    const risky = fixRunResult.rejected.filter(
      (r) => r.rejectionReason !== "user-declined" && r.rejectionReason !== "unknown-file"
    );
    lines.push("### Risky Fixes", "");
    if (risky.length === 0) {
      lines.push("_No risky fixes rejected._", "");
    } else {
      for (const r of risky) {
        lines.push(`- \u26A0\uFE0F \`${r.candidateId}\` \u2014 rejected: \`${r.rejectionReason}\``);
      }
      lines.push("");
    }
    const deferred = fixRunResult.deferred;
    lines.push("### Deferred Fixes", "");
    if (deferred.length === 0) {
      lines.push("_No deferred fixes._", "");
    } else {
      for (const r of deferred) {
        lines.push(`- \u23F3 \`${r.candidateId}\` \u2014 deferred`);
      }
      lines.push("");
    }
    return lines;
  }
  // ─── Validation Results ────────────────────────────────────────────────────
  validationResults() {
    const { validation } = this.data;
    if (!validation) return [];
    const lines = ["## Validation Results", ""];
    const checks = [
      ["Build", validation.build],
      ["Test", validation.test],
      ["Lint", validation.lint],
      ["Typecheck", validation.typecheck],
      ["UI", validation.ui]
    ];
    for (const [label, check] of checks) {
      if (!check) continue;
      const icon = check.passed ? "\u2705" : "\u274C";
      lines.push(`### ${label} ${icon}`, "");
      lines.push(`- Duration: ${check.durationMs}ms`);
      if (check.output) lines.push("", "```", check.output, "```");
      if (check.error) lines.push(`- Error: ${check.error}`);
      lines.push("");
    }
    return lines;
  }
  // ─── Patch Section ─────────────────────────────────────────────────────────
  patchSection() {
    const { fixRunResult } = this.data;
    if (!fixRunResult?.patchResult?.patchContent) return [];
    const lines = [
      "## Patch Diff",
      "",
      "```diff",
      fixRunResult.patchResult.patchContent,
      "```",
      ""
    ];
    return lines;
  }
  // ─── Diff Review ────────────────────────────────────────────────────────────
  diffReviewSection() {
    const { diffReview } = this.data;
    if (!diffReview) return [];
    const lines = ["## Diff Review", ""];
    const decisionIcon = diffReview.recommendation === "approve" ? "\u2705" : diffReview.recommendation === "request_changes" ? "\u26A0\uFE0F" : "\u274C";
    lines.push(`**Comparison:** \`${diffReview.baseRef}\` \u2192 \`${diffReview.targetRef}\``, "");
    lines.push(`**Recommendation:** ${decisionIcon} **${diffReview.recommendation.replace("_", " ").toUpperCase()}** (confidence: ${diffReview.confidence})`, "");
    lines.push("");
    lines.push(diffReview.summary, "");
    lines.push("");
    lines.push("### Changed Files", "");
    lines.push(diffReview.changedFilesSummary, "");
    lines.push("");
    if (diffReview.riskByFile.length > 0) {
      lines.push("### Risk by File", "");
      lines.push("| File | Risk |", "|------|------|");
      for (const rf of diffReview.riskByFile) {
        const riskIcon = rf.risk === "critical" ? "\u{1F534}" : rf.risk === "high" ? "\u{1F7E0}" : rf.risk === "medium" ? "\u{1F7E1}" : "\u{1F7E2}";
        lines.push(`| \`${rf.file}\` | ${riskIcon} ${rf.risk} |`);
      }
      lines.push("");
    }
    if (diffReview.changedRoutes.length > 0) {
      lines.push("### Changed Routes", "");
      for (const r of diffReview.changedRoutes) lines.push(`- \`${r}\``);
      lines.push("");
    }
    if (diffReview.changedApis.length > 0) {
      lines.push("### Changed APIs", "");
      for (const a of diffReview.changedApis) lines.push(`- \`${a}\``);
      lines.push("");
    }
    if (diffReview.findingsIntroducedByDiff.length > 0) {
      lines.push("### Findings Introduced by Diff", "");
      for (const f of diffReview.findingsIntroducedByDiff) lines.push(`- ${f}`);
      lines.push("");
    }
    if (diffReview.preExistingFindingsIgnored.length > 0) {
      lines.push("### Pre-existing Findings Ignored (Diff Mode)", "");
      lines.push("_The following findings were suppressed because they are not related to changed files:_", "");
      for (const f of diffReview.preExistingFindingsIgnored) lines.push(`- ${f}`);
      lines.push("");
    }
    lines.push("---", "");
    return lines;
  }
  // ─── Evidence Index ────────────────────────────────────────────────────────
  evidenceIndex() {
    const { runPath, findings } = this.data;
    const lines = ["## Evidence Index", ""];
    const evidenceFiles = this.gatherEvidenceFiles(runPath);
    const categories = [
      ["Logs", evidenceFiles.filter((f) => f.kind === "log")],
      ["Screenshots", evidenceFiles.filter((f) => f.kind === "screenshot")],
      ["Traces", evidenceFiles.filter((f) => f.kind === "trace")],
      ["JSON Files", evidenceFiles.filter((f) => f.kind === "json")],
      ["Patch Files", evidenceFiles.filter((f) => f.kind === "patch")],
      ["Other", evidenceFiles.filter((f) => f.kind === "other")]
    ];
    for (const [label, files] of categories) {
      if (files.length === 0) continue;
      lines.push(`### ${label}`, "");
      for (const f of files) {
        const sizeKb = f.size > 0 ? `(${(f.size / 1024).toFixed(1)} KB)` : "";
        lines.push(`- [${f.label}](file://${f.path}) ${sizeKb}`);
      }
      lines.push("");
    }
    return lines;
  }
  // ─── Helpers ───────────────────────────────────────────────────────────────
  gatherEvidenceFiles(runPath) {
    try {
      const fs = createRequire(import.meta.url)("fs");
      const { readdirSync, statSync } = fs;
      const files = [];
      const entries = readdirSync(runPath, { recursive: true });
      for (const entry of entries) {
        const fullPath = join(runPath, entry);
        let size = 0;
        try {
          size = statSync(fullPath).size;
        } catch {
        }
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
};
function verdictBadge(v) {
  return { GO: "GO", CONDITIONAL_GO: "CONDITIONAL_GO", NO_GO: "NO_GO", INTERNAL_ONLY: "INTERNAL_ONLY" }[v];
}
function severityCounts(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length
  };
}
function classifyFile(path) {
  const lc = path.toLowerCase();
  if (lc.endsWith(".log")) return "log";
  if (lc.endsWith(".png") || lc.endsWith(".jpg")) return "screenshot";
  if (lc.endsWith(".trace") || lc.endsWith(".perf")) return "trace";
  if (lc.endsWith(".json")) return "json";
  if (lc.endsWith(".diff") || lc.endsWith(".patch")) return "patch";
  return "";
}
function renderScoreBar(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return "[" + "\u2588".repeat(filled) + "\u2591".repeat(empty) + "]";
}

// src/HtmlReportWriter.ts
import { join as join2 } from "path";
var HtmlReportWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  async write(runPath) {
    const { writeFileSync } = await import("fs");
    const content = this.render();
    const dest = join2(runPath, "TURPAN_ANALYSIS.html");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  render() {
    const d = this.data;
    const counts = severityCounts2(d.findings);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Turpan Analysis \u2014 ${d.runId}</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e;
    --critical: #f85149; --high: #f0883e; --medium: #d29922;
    --low: #3fb950; --info: #58a6ff;
    --accent: #238636;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'SF Mono', 'Fira Code', Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font: 14px/1.6 var(--font); padding: 2rem; }
  .container { max-width: 1100px; margin: 0 auto; }

  /* \u2500\u2500 Header \u2500\u2500 */
  .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
  .header h1 { font-size: 1.6rem; letter-spacing: -0.02em; }
  .run-id { color: var(--muted); font-family: var(--mono); font-size: 0.8rem; }

  /* \u2500\u2500 Verdict banner \u2500\u2500 */
  .verdict {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 1rem; border-radius: 6px; font-weight: 700; font-size: 1.1rem;
    margin-bottom: 1.5rem;
  }
  .verdict.GO        { background: #23863622; color: #3fb950; border: 1px solid #3fb95055; }
  .verdict.CONDITIONAL_GO { background: #d2992222; color: #f0883e; border: 1px solid #f0883e55; }
  .verdict.NO_GO     { background: #f8514922; color: #f85149; border: 1px solid #f8514955; }
  .verdict.INTERNAL_ONLY { background: #58a6ff22; color: #58a6ff; border: 1px solid #58a6ff55; }

  /* \u2500\u2500 Sections \u2500\u2500 */
  h2 { font-size: 1.1rem; color: var(--text); margin: 2rem 0 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border); }
  h3 { font-size: 0.95rem; color: var(--muted); margin: 1.2rem 0 0.4rem; }
  p, li { color: var(--text); }

  /* \u2500\u2500 Tables \u2500\u2500 */
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
  th { text-align: left; padding: 0.4rem 0.75rem; background: var(--surface); color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
  td { padding: 0.4rem 0.75rem; border-bottom: 1px solid #21262d; vertical-align: top; }
  tr:hover td { background: #161b22; }

  /* \u2500\u2500 Scorecard grid \u2500\u2500 */
  .scorecard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; margin: 1rem 0; }
  .scorecard-cell {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.75rem; text-align: center;
  }
  .scorecell-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .scorecell-value { font-size: 1.8rem; font-weight: 700; line-height: 1.2; }
  .scorecell-max   { font-size: 0.75rem; color: var(--muted); }
  .scorecell-bar   { height: 4px; background: #30363d; border-radius: 2px; margin-top: 0.4rem; overflow: hidden; }
  .scorecell-fill  { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* \u2500\u2500 Severity counts \u2500\u2500 */
  .severity-row { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
  .sev-chip { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
  .sev-critical { background: #f8514922; color: var(--critical); }
  .sev-high     { background: #f0883e22; color: var(--high); }
  .sev-medium   { background: #d2992222; color: var(--medium); }
  .sev-low      { background: #3fb95022; color: var(--low); }
  .sev-info     { background: #58a6ff22; color: var(--info); }

  /* \u2500\u2500 Findings \u2500\u2500 */
  .finding { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; margin: 0.5rem 0; }
  .finding-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }
  .finding-sev { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .finding-title { font-weight: 600; font-size: 0.9rem; }
  .finding-meta { font-size: 0.75rem; color: var(--muted); font-family: var(--mono); }
  .finding-body { font-size: 0.85rem; color: var(--muted); margin-top: 0.3rem; }
  .finding-file { font-family: var(--mono); font-size: 0.78rem; color: var(--muted); }
  .evidence-item { background: #0d1117; border: 1px solid #21262d; border-radius: 4px; padding: 0.3rem 0.5rem; margin: 0.2rem 0; font-family: var(--mono); font-size: 0.78rem; color: var(--muted); }
  .fix-tag { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; }
  .fix-safe { background: #23863622; color: #3fb950; }
  .fix-risky { background: #f8514922; color: #f85149; }
  .fix-defer { background: #d2992222; color: #d29922; }

  /* \u2500\u2500 Filter chips \u2500\u2500 */
  .filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.75rem 0; }
  .filter-chip {
    padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.78rem; cursor: pointer;
    border: 1px solid var(--border); background: var(--surface); color: var(--muted);
    transition: all 0.15s;
  }
  .filter-chip:hover { border-color: var(--text); color: var(--text); }
  .filter-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  /* \u2500\u2500 Screenshots gallery \u2500\u2500 */
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; margin: 0.75rem 0; }
  .gallery-item { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .gallery-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #000; }
  .gallery-caption { padding: 0.4rem 0.6rem; font-size: 0.78rem; color: var(--muted); font-family: var(--mono); }

  /* \u2500\u2500 Collapsible evidence \u2500\u2500 */
  .collapsible { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin: 0.3rem 0; overflow: hidden; }
  .collapsible-header { padding: 0.5rem 0.75rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--muted); user-select: none; }
  .collapsible-header:hover { background: #1c2128; color: var(--text); }
  .collapsible-header::after { content: '\u25B6'; font-size: 0.6rem; transition: transform 0.2s; }
  .collapsible.open .collapsible-header::after { transform: rotate(90deg); }
  .collapsible-body { display: none; padding: 0.5rem 0.75rem; font-family: var(--mono); font-size: 0.78rem; color: var(--muted); background: #0d1117; border-top: 1px solid var(--border); white-space: pre-wrap; word-break: break-all; }
  .collapsible.open .collapsible-body { display: block; }

  /* \u2500\u2500 Fix plan \u2500\u2500 */
  .fix-applied  { color: #3fb950; }
  .fix-rejected { color: #f85149; }
  .fix-deferred { color: #d29922; }

  /* \u2500\u2500 Validation \u2500\u2500 */
  .val-pass { color: #3fb950; }
  .val-fail { color: #f85149; }

  /* \u2500\u2500 Agent audit bars \u2500\u2500 */
  .audit-bar { display: flex; gap: 0.3rem; align-items: center; margin: 0.2rem 0; }
  .audit-pct { font-size: 0.8rem; font-weight: 700; min-width: 3ch; text-align: right; }

  /* \u2500\u2500 Footer \u2500\u2500 */
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }

  /* \u2500\u2500 Responsive \u2500\u2500 */
  @media (max-width: 600px) {
    body { padding: 1rem; }
    .scorecard-grid { grid-template-columns: repeat(2, 1fr); }
    .gallery { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="container">

<!-- \u2500\u2500 Header \u2500\u2500 -->
<div class="header">
  <h1>\u{1F3DB}\uFE0F Turpan Analysis</h1>
  <span class="run-id">${d.runId}</span>
</div>

<!-- \u2500\u2500 Verdict \u2500\u2500 -->
<div class="verdict ${d.verdict}">
  ${verdictIcon(d.verdict)} ${d.verdict.replace("_", " ")}
</div>

<!-- \u2500\u2500 Executive Summary \u2500\u2500 -->
<h2>Executive Summary</h2>
<ul>
${executiveSummaryItems(d).map((item) => `  <li>${item}</li>`).join("\n")}
</ul>

<!-- \u2500\u2500 Scorecard \u2500\u2500 -->
<h2>Scorecard</h2>
<div class="scorecard-grid">
${scorecardCells(d).join("\n")}
</div>
<div class="severity-row">
  <span class="sev-chip sev-critical">\u{1F534} ${counts.critical} Critical</span>
  <span class="sev-chip sev-high">\u{1F7E0} ${counts.high} High</span>
  <span class="sev-chip sev-medium">\u{1F7E1} ${counts.medium} Medium</span>
  <span class="sev-chip sev-low">\u{1F7E2} ${counts.low} Low</span>
  <span class="sev-chip sev-info">\u{1F535} ${counts.info} Info</span>
</div>

<!-- \u2500\u2500 Findings filter \u2500\u2500 -->
<h2>Findings</h2>
<div class="filters" id="severity-filters">
  <span class="filter-chip active" data-sev="all">All</span>
  <span class="filter-chip" data-sev="critical">Critical</span>
  <span class="filter-chip" data-sev="high">High</span>
  <span class="filter-chip" data-sev="medium">Medium</span>
  <span class="filter-chip" data-sev="low">Low</span>
  <span class="filter-chip" data-sev="info">Info</span>
</div>
<div id="findings-list">
${renderFindings(d.findings).join("\n")}
</div>

<!-- \u2500\u2500 Live UI Review \u2500\u2500 -->
${d.uiReview ? renderUiReview(d.uiReview) : ""}

<!-- \u2500\u2500 Code Quality \u2500\u2500 -->
${d.codeQuality ? renderCodeQuality(d.codeQuality) : ""}

<!-- \u2500\u2500 Security \u2500\u2500 -->
${d.security ? renderSecurity(d.security) : ""}

<!-- \u2500\u2500 Dependency Audit \u2500\u2500 -->
${d.dependencyAudit ? renderDependencyAudit(d.dependencyAudit) : ""}

<!-- \u2500\u2500 Authenticated SaaS Review \u2500\u2500 -->
${d.authenticatedSaas ? renderAuthenticatedSaas(d.authenticatedSaas) : ""}

<!-- \u2500\u2500 Agent Output Audit \u2500\u2500 -->
${d.agentAudit ? renderAgentAudit(d.agentAudit) : ""}

<!-- \u2500\u2500 Fix Plan \u2500\u2500 -->
${d.fixRunResult ? renderFixPlan(d.fixRunResult) : ""}

<!-- \u2500\u2500 Validation Results \u2500\u2500 -->
${d.validation ? renderValidation(d.validation) : ""}

<!-- \u2500\u2500 Evidence Index \u2500\u2500 -->
<h2>Evidence Index</h2>
${renderEvidenceIndex(d.runPath)}

<!-- \u2500\u2500 Footer \u2500\u2500 -->
<div class="footer">
  Generated by Turpan \xB7 ${new Date(d.timestamp).toLocaleString()} \xB7 ${d.duration}ms
</div>
</div>

<script>
// \u2500\u2500 Filter chips \u2500\u2500
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const sev = chip.dataset.sev;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    document.querySelectorAll('.finding').forEach(f => {
      f.style.display = (sev === 'all' || f.dataset.sev === sev) ? '' : 'none';
    });
  });
});

// \u2500\u2500 Collapsibles \u2500\u2500
document.querySelectorAll('.collapsible-header').forEach(h => {
  h.addEventListener('click', () => {
    h.parentElement?.classList.toggle('open');
  });
});
</script>
</body>
</html>`;
  }
};
function scorecardCells(d) {
  const { scorecard } = d;
  const cells = [];
  const overall = scorecard.overall ?? 0;
  const add = (label, score) => {
    const pct = Math.round(score);
    const hue = score > 80 ? "120" : score > 60 ? "45" : score > 40 ? "20" : "0";
    cells.push(`<div class="scorecard-cell">
  <div class="scorecell-label">${label}</div>
  <div class="scorecell-value" style="color: hsl(${hue},70%,55%)">${score}</div>
  <div class="scorecell-max">/100</div>
  <div class="scorecell-bar"><div class="scorecell-fill" style="width:${pct}%;background:hsl(${hue},70%,55%)"></div></div>
</div>`);
  };
  add("Overall", overall);
  if (scorecard.categories) {
    add("Build", scorecard.categories.correctness ?? overall);
    add("Test", scorecard.categories.codeCoverage ?? overall);
    add("Quality", scorecard.categories.maintainability ?? overall);
    add("Security", scorecard.categories.security ?? overall);
    add("Performance", scorecard.categories.performance ?? overall);
  }
  return cells;
}
function executiveSummaryItems(d) {
  const { findings, scorecard, verdict } = d;
  const items = [];
  const counts = severityCounts2(findings);
  if (verdict === "GO") items.push(`\u2705 <strong>GO</strong> \u2014 score ${scorecard.overall}/100`);
  else if (verdict === "CONDITIONAL_GO") items.push(`\u26A0\uFE0F <strong>CONDITIONAL_GO</strong> \u2014 ${counts.high} high, ${counts.medium} medium findings`);
  else if (verdict === "NO_GO") items.push(`\u274C <strong>NO_GO</strong> \u2014 ${counts.critical} critical findings must be resolved`);
  else items.push(`\u{1F512} <strong>INTERNAL_ONLY</strong> \u2014 not ready for external deployment`);
  items.push(`Overall score: <strong>${scorecard.overall}/100</strong>`);
  if (counts.critical > 0) items.push(`\u{1F534} ${counts.critical} critical finding${counts.critical !== 1 ? "s" : ""}`);
  if (counts.high > 0) items.push(`\u{1F7E0} ${counts.high} high severity finding${counts.high !== 1 ? "s" : ""}`);
  if (findings.length === 0) items.push("\u2705 Clean run \u2014 no findings");
  if (scorecard.categories) {
    const overall = scorecard.overall ?? 0;
    items.push(`Build health: <strong>${scorecard.categories.correctness ?? overall}/100</strong>`);
    items.push(`Security: <strong>${scorecard.categories.security ?? overall}/100</strong>`);
  }
  return items;
}
function renderFindings(findings) {
  if (findings.length === 0) return ['<p style="color:var(--muted)">No findings.</p>'];
  return findings.map((f) => {
    const sevColor = { critical: "var(--critical)", high: "var(--high)", medium: "var(--medium)", low: "var(--low)", info: "var(--info)" }[f.severity];
    const evidence = f.evidence.map(
      (e) => `<div class="evidence-item">${e.label ?? e.type}: ${e.excerpt ?? e.path ?? ""}</div>`
    ).join("");
    return `<div class="finding" data-sev="${f.severity}">
  <div class="finding-header">
    <span class="finding-sev" style="background:${sevColor}"></span>
    <span class="finding-title">${escHtml(f.title)}</span>
  </div>
  ${f.file ? `<div class="finding-file">${escHtml(f.file)}${f.line ? ":" + f.line : ""}</div>` : ""}
  <div class="finding-body">${escHtml(f.explanation)}</div>
  ${f.suggestedFix ? `<div class="finding-body"><strong>Fix:</strong> ${escHtml(f.suggestedFix)}</div>` : ""}
  ${evidence ? `<div style="margin-top:0.4rem">${evidence}</div>` : ""}
</div>`;
  });
}
function renderUiReview(ui) {
  const screenshots = ui.screenshots.length > 0 ? `<div class="gallery">${ui.screenshots.map((s) => `
      <div class="gallery-item">
        <img class="gallery-img" src="${escAttr(s.path)}" alt="${escAttr(s.label ?? s.route)}" loading="lazy">
        <div class="gallery-caption">${escHtml(s.label ?? s.route)}</div>
      </div>`).join("")}</div>` : '<p style="color:var(--muted)">No screenshots captured.</p>';
  const consoleErrs = ui.consoleErrors.length > 0 ? ui.consoleErrors.map((e) => `<li><code>${escHtml(e.route)}</code>: ${escHtml(e.message)} (\xD7${e.count})</li>`).join("") : "<li>\u2705 No console errors</li>";
  const netErrs = ui.networkErrors.length > 0 ? ui.networkErrors.map((e) => `<li><code>${escHtml(e.route)}</code> [${e.status}] ${escHtml(e.url)} (\xD7${e.count})</li>`).join("") : "<li>\u2705 No network errors</li>";
  return `
<h2>Live UI Review</h2>
<p><strong>Routes tested:</strong> ${ui.routesTested.join(", ") || "none"}</p>
<h3>Screenshots</h3>
${screenshots}
<h3>Console Errors</h3><ul>${consoleErrs}</ul>
<h3>Network Errors</h3><ul>${netErrs}</ul>
${ui.interactionFindings.length > 0 ? `<h3>Interaction Findings</h3><ul>${ui.interactionFindings.map((f) => `<li>${escHtml(f)}</li>`).join("")}</ul>` : ""}
${ui.mobileFindings.length > 0 ? `<h3>Mobile Findings</h3><ul>${ui.mobileFindings.map((f) => `<li>${escHtml(f)}</li>`).join("")}</ul>` : ""}
`;
}
function renderCodeQuality(cq) {
  const sections = [
    ["Maintainability", cq.maintainability],
    ["Dead Code", cq.deadCode],
    ["Duplicate Code", cq.duplicateCode],
    ["Complexity", cq.complexity],
    ["Unused Dependencies", cq.unusedDependencies]
  ];
  return `<h2>Code Quality Review</h2>
${sections.map(([title, items]) => `
<h3>${title}</h3>
${items.length === 0 ? '<p style="color:var(--muted)">No issues detected.</p>' : `<ul>${items.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>`}
`).join("")}`;
}
function renderSecurity(sec) {
  const sections = [
    ["Secrets", sec.secrets],
    ["Authentication", sec.auth],
    ["CORS", sec.cors],
    ["Injection Risks", sec.injectionRisks],
    ["MCP/Tool Risks", sec.mcpToolRisks]
  ];
  return `<h2>Security Review</h2>
${sections.map(([title, items]) => `
<h3>${title}</h3>
${items.length === 0 ? '<p style="color:var(--muted)">No issues detected.</p>' : `<ul>${items.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>`}
`).join("")}`;
}
function renderDependencyAudit(da) {
  const modeBadge = da.mode === "online" ? "\u{1F310} ONLINE" : "\u{1F4E6} OFFLINE";
  const sevColor = (sev) => sev === "critical" ? "#dc2626" : sev === "high" ? "#f97316" : sev === "medium" ? "#eab308" : "#3b82f6";
  const vulnRows = da.vulnerabilities.map((v) => `
    <tr>
      <td><code>${escHtml(v.name)}</code></td>
      <td><code>${escHtml(v.version)}</code></td>
      <td><span style="color:${sevColor(v.severity)};font-weight:bold">${v.severity.toUpperCase()}</span></td>
      <td>${escHtml(v.cveId ?? "\u2014")}</td>
      <td>${v.source}</td>
      <td>${escHtml(v.title)}${v.exploitedInWild ? " \u26A0\uFE0F exploited" : ""}</td>
    </tr>`).join("");
  const licViolations = da.licenses.filter((l) => l.policyViolation).map((l) => `
    <tr>
      <td><code>${escHtml(l.name)}</code></td>
      <td>${escHtml(l.license ?? "(missing)")}</td>
      <td style="color:#dc2626">HIGH</td>
      <td>${escHtml(l.reason)}</td>
    </tr>`).join("");
  const licWarnings = da.licenses.filter((l) => !l.policyViolation && l.risk !== "none").map((l) => `
    <tr>
      <td><code>${escHtml(l.name)}</code></td>
      <td>${escHtml(l.license ?? "(missing)")}</td>
      <td style="color:${l.risk === "high" ? "#f97316" : "#eab308"}">${l.risk.toUpperCase()}</td>
      <td>${escHtml(l.reason)}</td>
    </tr>`).join("");
  const errorList = da.errors.length > 0 ? `
    <h3>Audit Errors</h3>
    <ul>${da.errors.map((e) => `<li>\u26A0\uFE0F ${escHtml(e)}</li>`).join("")}</ul>` : "";
  const limitList = da.limitations.length > 0 ? `
    <h3>Limitations</h3>
    <ul>${da.limitations.map((l) => `<li>${escHtml(l)}</li>`).join("")}</ul>` : "";
  return `<h2>Dependency Audit</h2>
<p><strong>Mode:</strong> ${modeBadge}</p>
<p><strong>Artifacts:</strong> Internal SBOM: <code>${escHtml(da.sbomPath)}</code> \xB7 CycloneDX SBOM: <code>${escHtml(da.sbomCdxPath)}</code></p>

<h3>Inventory</h3>
<ul>
  <li>Total components: <strong>${da.componentCount}</strong></li>
  <li>Direct deps: <strong>${da.directCount}</strong></li>
  <li>Transitive deps: <strong>${da.transitiveCount}</strong></li>
</ul>

<h3>Vulnerabilities</h3>
${da.vulnerabilities.length === 0 ? '<p style="color:var(--muted)">No known vulnerabilities found.</p>' : `<table class="findings-table">
    <thead><tr><th>Package</th><th>Version</th><th>Severity</th><th>CVE</th><th>Source</th><th>Title</th></tr></thead>
    <tbody>${vulnRows}</tbody>
  </table>`}

<h3>License Audit</h3>
${da.licenses.length === 0 ? '<p style="color:var(--muted)">No license issues detected.</p>' : `${licViolations || licWarnings ? `<table class="findings-table">
        <thead><tr><th>Package</th><th>License</th><th>Risk</th><th>Reason</th></tr></thead>
        <tbody>${licViolations}${licWarnings}</tbody>
      </table>` : '<p style="color:var(--muted)">All dependencies have permissive licenses.</p>'}`}

${errorList}
${limitList}`;
}
function renderAuthenticatedSaas(sa) {
  const color = (v) => {
    if (v === "passed" || v === "usable" || v === "wired" || v === "protected" || v === "redirected") return "#10b981";
    if (v === "warn" || v === "partially_usable" || v === "noop_save" || v === "fake_success") return "#f59e0b";
    if (v === "failed" || v === "broken" || v === "empty" || v === "unprotected_unauth" || v === "unprotected_authed" || v === "unprotected") return "#dc2626";
    return "#6b7280";
  };
  const testUserBadge = sa.testUserEnabled ? '<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;">ENABLED</span>' : '<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;">DISABLED (dry-run)</span>';
  if (!sa.testUserEnabled) {
    return `<h2>Authenticated SaaS Review</h2>
<p>${testUserBadge} &mdash; Authenticated scenarios ran in dry-run mode.</p>
<p><em>Login forms were inspected but NOT submitted. To enable real seeded login, set <code>ui.testUser.enabled: true</code> in <code>turpan.yml</code> with a test user account.</em></p>
<h3>Limitations</h3>
<ul>${sa.limitations.map((l) => `<li>${escHtml(l)}</li>`).join("")}</ul>`;
  }
  const row = (label, value) => `<tr><td>${escHtml(label)}</td><td><span style="color:${color(value)};font-weight:bold">${escHtml(value.toUpperCase())}</span></td></tr>`;
  return `<h2>Authenticated SaaS Review</h2>
<p>${testUserBadge}</p>

<h3>Status</h3>
<table class="findings-table">
  <thead><tr><th>Check</th><th>Status</th></tr></thead>
  <tbody>
    ${row("Login", sa.loginStatus)}
    ${row("Protected Routes", sa.protectedRouteBehavior)}
    ${row("Admin (unauthenticated)", sa.adminAccess)}
    ${row("Dashboard", sa.dashboardUsability)}
    ${row("Settings", sa.settingsBehavior)}
    ${row("Billing Test Mode", sa.billingBehavior)}
  </tbody>
</table>

<h3>Artifacts</h3>
<ul>
  <li><code>${escHtml(sa.authStatePath)}</code> &mdash; Auth state metadata (NO secrets)</li>
  <li><code>${escHtml(sa.scenarioArtifactPaths.auth)}</code></li>
  <li><code>${escHtml(sa.scenarioArtifactPaths.dashboard)}</code></li>
  <li><code>${escHtml(sa.scenarioArtifactPaths.settings)}</code></li>
  <li><code>${escHtml(sa.scenarioArtifactPaths.billing)}</code></li>
  <li><code>${escHtml(sa.scenarioArtifactPaths.admin)}</code></li>
</ul>

<h3>Limitations</h3>
<ul>${sa.limitations.map((l) => `<li>${escHtml(l)}</li>`).join("")}</ul>`;
}
function renderAgentAudit(audit) {
  const score = audit.completionScore;
  const pct = score;
  const hue = score > 80 ? "120" : score > 60 ? "45" : "20";
  const rec = audit.recommendation ?? "UNKNOWN";
  const conf = audit.confidenceLevel ?? "medium";
  const ic = audit.issuesCount ?? { critical: 0, high: 0, medium: 0, low: 0 };
  return `<h2>Agent Output Audit</h2>
<div class="audit-bar">
  <span class="audit-pct" style="color:hsl(${hue},70%,55%)">${score}</span>
  <div class="scorecell-bar" style="flex:1"><div class="scorecell-fill" style="width:${pct}%;background:hsl(${hue},70%,55%)"></div></div>
  <span>Completion Score</span>
  <span style="margin-left:1rem;font-weight:600">${rec}</span>
  <span style="margin-left:.5rem;color:var(--muted)">confidence: ${conf}</span>
</div>
<div style="display:flex;gap:1rem;margin:.5rem 0">
  <span style="color:#ef4444">\u25CF ${ic.critical} critical</span>
  <span style="color:#f97316">\u25CF ${ic.high} high</span>
  <span style="color:#eab308">\u25CF ${ic.medium} medium</span>
  <span style="color:#22c55e">\u25CF ${ic.low} low</span>
</div>
<h3>Requested Capabilities</h3>
<ul>${audit.requestedCapabilities.length === 0 ? '<li style="color:var(--muted)">None detected in task</li>' : audit.requestedCapabilities.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>
<h3>Implemented</h3>
<ul>${audit.implementedCapabilities.length === 0 ? '<li style="color:var(--muted)">None detected</li>' : audit.implementedCapabilities.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>
<h3>Missing</h3>
${audit.missingCapabilities.length === 0 ? '<p style="color:var(--muted)">None \u2014 all requested capabilities are implemented.</p>' : `<ul>${audit.missingCapabilities.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>`}
<h3>Fake / Shallow Implementations</h3>
${audit.fakeShallowImpls.length === 0 ? '<p style="color:var(--muted)">None detected.</p>' : `<ul>${audit.fakeShallowImpls.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>`}
`;
}
function renderFixPlan(fr) {
  const applied = fr.applied.filter((r) => r.decision === "applied");
  const rejected = fr.rejected.filter((r) => r.rejectionReason !== "user-declined");
  const deferred = fr.deferred;
  const rows = [
    ...applied.map((r) => `<tr><td class="fix-applied">\u2705</td><td>${r.candidateId}</td><td>applied</td><td>${r.validation?.allPassed ? '<span class="val-pass">passed</span>' : '<span class="val-fail">failed</span>'} (${r.validation?.totalDurationMs ?? 0}ms)</td></tr>`),
    ...rejected.map((r) => `<tr><td class="fix-rejected">\u26A0\uFE0F</td><td>${r.candidateId}</td><td>rejected</td><td>${r.rejectionReason ?? ""}</td></tr>`),
    ...deferred.map((r) => `<tr><td class="fix-deferred">\u23F3</td><td>${r.candidateId}</td><td>deferred</td><td></td></tr>`)
  ];
  return `<h2>Fix Plan</h2>
<table>
  <tr><th></th><th>Candidate</th><th>Decision</th><th>Detail</th></tr>
  ${rows.join("\n")}
</table>
<h3>Patch Diff</h3>
<pre style="background:#0d1117;border:1px solid var(--border);border-radius:6px;padding:0.75rem;overflow:auto;font-family:var(--mono);font-size:0.78rem;color:var(--muted)">${escHtml(fr.patchResult?.patchContent ?? "No patch generated.")}</pre>
`;
}
function renderValidation(val) {
  const raw = [
    ["Build", val.build],
    ["Test", val.test],
    ["Lint", val.lint],
    ["Typecheck", val.typecheck],
    ["UI", val.ui]
  ];
  const checks = [];
  for (const entry of raw) {
    if (entry[1] !== void 0) checks.push([entry[0], entry[1]]);
  }
  return `<h2>Validation Results</h2>
<table>
  <tr><th>Check</th><th>Status</th><th>Duration</th><th>Output</th></tr>
  ${checks.map(([label, check]) => `
  <tr>
    <td>${label}</td>
    <td class="${check.passed ? "val-pass" : "val-fail"}">${check.passed ? "\u2705 Pass" : "\u274C Fail"}</td>
    <td>${check.durationMs}ms</td>
    <td><pre style="font-size:0.75rem;color:var(--muted);white-space:pre-wrap">${escHtml(check.output ?? check.error ?? "")}</pre></td>
  </tr>`).join("")}
</table>`;
}
function renderEvidenceIndex(runPath) {
  return `<p style="color:var(--muted);font-size:0.82rem">
  Evidence files are indexed at
  <code>.turpan/runs/&lt;runId&gt;/</code>.
  Open the run directory to browse logs, screenshots, and traces.
</p>`;
}
function verdictIcon(v) {
  return { GO: "\u2705", CONDITIONAL_GO: "\u26A0\uFE0F", NO_GO: "\u274C", INTERNAL_ONLY: "\u{1F512}" }[v];
}
function severityCounts2(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length
  };
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/JsonReportWriter.ts
import { join as join3 } from "path";
var JsonReportWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  async write(runPath) {
    const { writeFileSync } = await import("fs");
    const content = JSON.stringify(this.build(), null, 2);
    const dest = join3(runPath, "TURPAN_FINDINGS.json");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  /** Return the serialised object directly (used by CLI for --json flag). */
  build() {
    const { runId, timestamp, projectPath, findings, verdict } = this.data;
    const breakdown = {
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      info: findings.filter((f) => f.severity === "info").length
    };
    return {
      version: "1.0.0",
      runId,
      timestamp,
      projectPath,
      verdict,
      total: findings.length,
      breakdown,
      findings: findings.map((f) => this.serialiseFinding(f))
    };
  }
  serialiseFinding(f) {
    return {
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.category,
      explanation: f.explanation,
      file: f.file,
      line: f.line,
      command: f.command,
      evidence: f.evidence.map((e) => ({
        type: e.type,
        label: e.label,
        path: e.path,
        excerpt: e.excerpt,
        url: e.url,
        timestamp: e.timestamp,
        command: e.command,
        exitCode: e.exitCode,
        value: e.value,
        unit: e.unit
      })),
      suggestedFix: f.suggestedFix,
      fixable: f.fixable,
      confidence: f.confidence,
      tags: f.tags
    };
  }
};

// src/ScorecardWriter.ts
import { join as join4 } from "path";
var ScorecardWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  async write(runPath) {
    const { writeFileSync } = await import("fs");
    const content = JSON.stringify(this.build(), null, 2);
    const dest = join4(runPath, "TURPAN_SCORECARD.json");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  build() {
    const { runId, timestamp, scorecard, findings, verdict, agentAudit } = this.data;
    const counts = severityCounts3(findings);
    const overall = scorecard.overall ?? 0;
    const health = (label, score, details = []) => ({
      label,
      score,
      details
    });
    const buildHealth = health("Build Health", scorecard.categories?.correctness ?? overall);
    const testHealth = health("Test Health", scorecard.categories?.codeCoverage ?? overall);
    const codeQuality = health("Code Quality", scorecard.categories?.maintainability ?? overall);
    const security = health("Security", scorecard.categories?.security ?? overall);
    const uiRuntime = health("UI Runtime", overall);
    const uiQuality = health("UI Quality", overall);
    const architecture = health("Architecture", this.deriveArchitectureScore());
    const deadCode = health("Dead Code", this.deriveDeadCodeScore());
    const agentOutputDetails = agentAudit ? [
      `Requested: ${agentAudit.requestedCapabilities.length}`,
      `Implemented: ${agentAudit.implementedCapabilities.length}`,
      `Missing: ${agentAudit.missingCapabilities.length}`,
      `Fake/Shallow: ${agentAudit.fakeShallowImpls.length}`,
      ...agentAudit.issuesCount ? [
        `Critical: ${agentAudit.issuesCount.critical}`,
        `High: ${agentAudit.issuesCount.high}`,
        `Medium: ${agentAudit.issuesCount.medium}`,
        `Low: ${agentAudit.issuesCount.low}`
      ] : []
    ] : [];
    const agentOutput = health("Agent Output", agentAudit?.completionScore ?? overall, agentOutputDetails);
    const releaseReadiness = health("Release Readiness", this.deriveReleaseReadinessScore(counts));
    return {
      version: "1.0.0",
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
        releaseReadiness
      },
      findingsSummary: {
        critical: counts.critical,
        high: counts.high,
        medium: counts.medium,
        low: counts.low,
        info: counts.info,
        total: findings.length
      },
      raw: scorecard
    };
  }
  deriveArchitectureScore() {
    const { findings } = this.data;
    const archFindings = findings.filter(
      (f) => f.category === "architecture" || f.category === "api-design"
    );
    const penalty = archFindings.reduce((sum, f) => {
      const s = { critical: 25, high: 15, medium: 7, low: 3, info: 0 };
      return sum + (s[f.severity] ?? 0);
    }, 0);
    return Math.max(0, 100 - penalty);
  }
  deriveDeadCodeScore() {
    const { findings } = this.data;
    const deadFindings = findings.filter((f) => f.category === "dead-code");
    const penalty = deadFindings.reduce((sum, f) => {
      const s = { critical: 10, high: 6, medium: 3, low: 1, info: 0 };
      return sum + (s[f.severity] ?? 0);
    }, 0);
    return Math.max(0, 100 - penalty);
  }
  deriveReleaseReadinessScore(counts) {
    const { agentAudit } = this.data;
    let score = 100;
    score -= counts.critical * 20;
    score -= counts.high * 10;
    score -= counts.medium * 4;
    score -= counts.low * 1;
    if (agentAudit) {
      const agentScore = agentAudit.completionScore;
      const agentPenalty = Math.round((100 - agentScore) * 0.25);
      score -= agentPenalty;
      const agentCriticalHigh = (agentAudit.issuesCount?.critical ?? 0) * 15 + (agentAudit.issuesCount?.high ?? 0) * 8;
      score -= agentCriticalHigh;
    }
    return Math.max(0, Math.min(100, score));
  }
};
function severityCounts3(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length
  };
}

// src/EvidenceIndexWriter.ts
import { join as join5 } from "path";
import { createRequire as createRequire2 } from "module";
var EvidenceIndexWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  async write(runPath) {
    const { writeFileSync } = await import("fs");
    const content = this.render();
    const dest = join5(runPath, "TURPAN_EVIDENCE_INDEX.md");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  render() {
    const { runPath, findings } = this.data;
    const files = this.gatherFiles(runPath);
    const index = this.categorise(files);
    const lines = [
      "# Evidence Index",
      "",
      `**Run:** ${this.data.runId}`,
      `**Total evidence files:** ${files.length}`,
      ""
    ];
    const sections = [
      ["Logs", index.logs],
      ["Screenshots", index.screenshots],
      ["Traces", index.traces],
      ["JSON Files", index.jsonFiles],
      ["Patch Files", index.patchFiles],
      ["Other", index.other]
    ];
    for (const [label, sectionFiles] of sections) {
      if (sectionFiles.length === 0) continue;
      lines.push(`## ${label}`, "");
      lines.push(`| File | Size |`, "|------|------|");
      for (const f of sectionFiles) {
        const sizeKb = f.size > 0 ? `${(f.size / 1024).toFixed(1)} KB` : "\u2014";
        lines.push(`| \`${f.label}\` | ${sizeKb} |`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  /** Return the categorised index object (used by other writers). */
  build() {
    const files = this.gatherFiles(this.data.runPath);
    return this.categorise(files);
  }
  // ─── Private ───────────────────────────────────────────────────────────────
  gatherFiles(runPath) {
    try {
      const fs = createRequire2(import.meta.url)("fs");
      const { readdirSync, statSync } = fs;
      const entries = readdirSync(runPath, { recursive: true });
      const files = [];
      for (const entry of entries) {
        if (typeof entry !== "string") continue;
        const fullPath = join5(runPath, entry);
        let size = 0;
        try {
          size = statSync(fullPath).size;
        } catch {
        }
        const kind = classifyFile2(entry);
        if (kind) {
          files.push({ label: entry, path: fullPath, size, kind });
        }
      }
      return files;
    } catch {
      return [];
    }
  }
  categorise(files) {
    return {
      logs: files.filter((f) => f.kind === "log"),
      screenshots: files.filter((f) => f.kind === "screenshot"),
      traces: files.filter((f) => f.kind === "trace"),
      jsonFiles: files.filter((f) => f.kind === "json"),
      patchFiles: files.filter((f) => f.kind === "patch"),
      other: files.filter((f) => f.kind === "other")
    };
  }
};
function classifyFile2(path) {
  const lc = path.toLowerCase();
  if (lc.includes("/logs/") || lc.endsWith(".log")) return "log";
  if (lc.endsWith(".png") || lc.endsWith(".jpg") || lc.endsWith(".jpeg")) return "screenshot";
  if (lc.endsWith(".trace") || lc.endsWith(".perf") || lc.endsWith(".profile")) return "trace";
  if (lc.endsWith(".json")) return "json";
  if (lc.endsWith(".diff") || lc.endsWith(".patch")) return "patch";
  return "";
}

// src/FixPlanWriter.ts
import { join as join6 } from "path";
var FixPlanWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  /** Return rendered fix plan markdown (used by tests). */
  render() {
    return this.renderFixPlan();
  }
  /** Write both TURPAN_FIX_PLAN.md and TURPAN_PATCH.diff. Returns paths written. */
  async write(runPath) {
    const { writeFileSync } = await import("fs");
    const fixPlanPath = join6(runPath, "TURPAN_FIX_PLAN.md");
    writeFileSync(fixPlanPath, this.renderFixPlan(), "utf-8");
    let patchPath;
    const patchContent = this.extractPatchContent();
    if (patchContent) {
      patchPath = join6(runPath, "TURPAN_PATCH.diff");
      writeFileSync(patchPath, patchContent, "utf-8");
    }
    return { fixPlanPath, patchPath };
  }
  // ─── Fix Plan ──────────────────────────────────────────────────────────────
  renderFixPlan() {
    const { fixRunResult } = this.data;
    if (!fixRunResult) return "# Fix Plan\n\n_No fix run recorded for this review._\n";
    const lines = ["# Turpan Fix Plan", ""];
    lines.push(`**Run:** ${fixRunResult.runId}`);
    lines.push(`**Mode:** ${fixRunResult.fixMode}`);
    lines.push(`**Duration:** ${fixRunResult.durationMs}ms`);
    lines.push("");
    lines.push("## Summary", "");
    lines.push(`| Metric | Count |`, "|--------|-------|");
    lines.push(`| Total candidates | ${fixRunResult.totalCandidates} |`);
    lines.push(`| Applied | ${fixRunResult.applied.length} |`);
    lines.push(`| Rejected | ${fixRunResult.rejected.length} |`);
    lines.push(`| Deferred | ${fixRunResult.deferred.length} |`);
    lines.push(`| All validation passed | ${fixRunResult.validation.allPassed ? "\u2705 Yes" : "\u274C No"} |`);
    lines.push("");
    lines.push("## Safe Fixes (Auto-Applicable)", "");
    const applied = fixRunResult.applied;
    if (applied.length === 0) {
      lines.push("_No safe fixes were applied._", "");
    } else {
      for (const r of applied) {
        const valStatus = r.validation?.allPassed ? "\u2705" : "\u274C";
        lines.push(`- \u2705 \`${r.candidateId}\` \u2014 applied ${valStatus}`);
        if (r.diff) {
          lines.push("", "```diff", r.diff, "```", "");
        }
      }
      lines.push("");
    }
    lines.push("## Risky Fixes (Blocked by Policy)", "");
    const risky = fixRunResult.rejected.filter(
      (r) => r.rejectionReason !== "user-declined" && r.rejectionReason !== "unknown-file"
    );
    if (risky.length === 0) {
      lines.push("_No risky fixes rejected._", "");
    } else {
      for (const r of risky) {
        lines.push(`- \u26A0\uFE0F \`${r.candidateId}\` \u2014 rejected: \`${r.rejectionReason ?? "unknown"}\``);
      }
      lines.push("");
    }
    lines.push("## Deferred Fixes", "");
    const deferred = fixRunResult.deferred;
    if (deferred.length === 0) {
      lines.push("_No deferred fixes._", "");
    } else {
      for (const r of deferred) {
        lines.push(`- \u23F3 \`${r.candidateId}\` \u2014 awaiting confirmation`);
      }
      lines.push("");
    }
    lines.push("## Files Modified", "");
    const { patchResult } = fixRunResult;
    if (patchResult.filesModified.length === 0) {
      lines.push("_No files modified._", "");
    } else {
      for (const f of patchResult.filesModified) {
        lines.push(`- \`${f}\``);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  // ─── Patch diff ────────────────────────────────────────────────────────────
  extractPatchContent() {
    const { fixRunResult } = this.data;
    return fixRunResult?.patchResult?.patchContent;
  }
};

// src/RunSummaryWriter.ts
import { join as join7 } from "path";
var RunSummaryWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  async write(runPath) {
    const { writeFileSync } = await import("fs");
    const content = JSON.stringify(this.build(), null, 2);
    const dest = join7(runPath, "TURPAN_RUN_SUMMARY.json");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  build() {
    const { runId, runPath, timestamp, duration, findings, scorecard, verdict, fingerprint } = this.data;
    const counts = severityCounts4(findings);
    return {
      version: "1.0.0",
      runId,
      runPath,
      timestamp,
      duration,
      projectPath: this.data.projectPath ?? "",
      verdict,
      overallScore: scorecard.overall ?? 0,
      findings: {
        critical: counts.critical,
        high: counts.high,
        medium: counts.medium,
        low: counts.low,
        info: counts.info,
        total: findings.length
      },
      scorecard,
      fingerprint: fingerprint ?? {},
      hasFixResult: !!this.data.fixRunResult,
      hasUiReview: !!this.data.uiReview,
      hasSecurity: !!this.data.security,
      hasAgentAudit: !!this.data.agentAudit,
      nextActions: this.deriveNextActions(counts, verdict)
    };
  }
  deriveNextActions(counts, verdict) {
    const actions = [];
    if (counts.critical > 0) {
      actions.push({
        priority: "critical",
        action: "Resolve critical findings before any release",
        reason: `${counts.critical} critical severity finding${counts.critical !== 1 ? "s" : ""} detected`
      });
    }
    if (counts.high > 0) {
      actions.push({
        priority: "high",
        action: "Address high-severity findings",
        reason: `${counts.high} high severity finding${counts.high !== 1 ? "s" : ""} detected`
      });
    }
    if (verdict === "GO" && this.data.findings.length === 0) {
      actions.push({
        priority: "low",
        action: "Mark as release-ready",
        reason: "All checks passed \u2014 project is ready for release"
      });
    }
    if (this.data.fixRunResult && !this.data.fixRunResult.validation.allPassed) {
      actions.push({
        priority: "high",
        action: "Re-run validation after applying fixes",
        reason: "Some fix validations failed"
      });
    }
    if (this.data.uiReview && this.data.uiReview.consoleErrors.length > 0) {
      actions.push({
        priority: "medium",
        action: "Investigate UI console errors",
        reason: `${this.data.uiReview.consoleErrors.length} route(s) with console errors`
      });
    }
    return actions;
  }
};
function severityCounts4(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length
  };
}

// src/PrCommentWriter.ts
import { join as join8 } from "path";
var PrCommentWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  /** Write the PR comment and return the file path. */
  async write(runPath) {
    const { mkdirSync: mkdirSync2, writeFileSync } = await import("fs");
    const content = this.render();
    mkdirSync2(runPath, { recursive: true });
    const dest = join8(runPath, "TURPAN_PR_COMMENT.md");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  render() {
    const { verdict, findings, scorecard, diffReview } = this.data;
    const critical = findings.filter((f) => f.severity === "critical").length;
    const high = findings.filter((f) => f.severity === "high").length;
    const medium = findings.filter((f) => f.severity === "medium").length;
    const low = findings.filter((f) => f.severity === "low").length;
    const verdictIcon2 = verdict === "GO" ? "\u2705" : verdict === "CONDITIONAL_GO" ? "\u26A0\uFE0F" : "\u274C";
    const verdictLabel = verdict === "GO" ? "GO" : verdict === "CONDITIONAL_GO" ? "CONDITIONAL GO" : verdict === "NO_GO" ? "NO GO" : "INTERNAL ONLY";
    const lines = [];
    if (!diffReview) {
      lines.push("## \u{1F42A} Turpan Review", "");
      lines.push("> Run with --from/--to flags for diff review", "");
      lines.push("");
      lines.push(`| Status | Score | Critical | High | Medium | Low |`);
      lines.push("|--------|-------|----------|------|--------|-----|");
      lines.push(`| ${verdictIcon2} **${verdictLabel}** | ${scorecard.overall}/100 | ${critical} | ${high} | ${medium} | ${low} |`);
      lines.push("");
      if (findings.length > 0) {
        lines.push("### \u{1F50E} Top Findings", "");
        const top = findings.slice(0, 10);
        for (const f of top) {
          const icon = f.severity === "critical" ? "\u{1F534}" : f.severity === "high" ? "\u{1F7E0}" : f.severity === "medium" ? "\u{1F7E1}" : "\u{1F535}";
          lines.push(`${icon} **${f.severity.toUpperCase()}** \`[${f.category}]\` ${f.title}`);
          if (f.file) lines.push(`   \u2514\u2500 ${f.file}${f.line ? `:${f.line}` : ""}`);
        }
        lines.push("");
      }
      lines.push("---", "");
      lines.push("_\u{1F916} Generated by [Turpan](https://github.com/turpan/turpan) \u2014 PR review agent_", "");
      return lines.join("\n");
    }
    const md = diffReview.mergeDecision;
    if (md?.decision === "block_merge") {
      lines.push("## \u274C MERGE BLOCKED", "");
      lines.push("> This PR has blocking issues that must be resolved before merge.", "");
      if (md.blockers.length > 0) {
        for (const b of md.blockers) lines.push(`- \u{1F6D1} ${b}`);
      }
      lines.push("");
    } else if (md?.decision === "request_changes") {
      lines.push("## \u26A0\uFE0F CHANGES REQUESTED", "");
      lines.push("> This PR has issues that should be addressed before merging.", "");
      if (md.warnings.length > 0) {
        for (const w of md.warnings) lines.push(`- \u26A0\uFE0F ${w}`);
      }
      lines.push("");
    }
    lines.push("## \u{1F42A} Turpan Review", "");
    lines.push(`> Diff review of \`${diffReview.baseRef} \u2192 ${diffReview.targetRef}\` | Overall: **${scorecard.overall}/100**`, "");
    lines.push("");
    lines.push(`| Status | Score | Critical | High | Medium | Low |`, "|--------|-------|----------|------|--------|-----|");
    lines.push(`| ${verdictIcon2} **${verdictLabel}** | ${scorecard.overall}/100 | ${critical} | ${high} | ${medium} | ${low} |`);
    lines.push("");
    const recIcon = diffReview.recommendation === "approve" ? "\u2705" : diffReview.recommendation === "request_changes" ? "\u26A0\uFE0F" : "\u274C";
    lines.push(`## ${recIcon} PR Decision: **${diffReview.recommendation.replace("_", " ").toUpperCase()}**`, "");
    lines.push("");
    lines.push(diffReview.summary, "");
    lines.push("");
    lines.push("### \u{1F4C1} Changed Files", "");
    lines.push(diffReview.changedFilesSummary, "");
    lines.push("");
    const criticalRisk = diffReview.riskByFile.filter((f) => f.risk === "critical");
    const highRisk = diffReview.riskByFile.filter((f) => f.risk === "high");
    if (criticalRisk.length > 0) {
      lines.push(`\u{1F534} **Critical risk files:** ${criticalRisk.map((f) => `\`${f.file}\``).join(", ")}`, "");
    }
    if (highRisk.length > 0) {
      lines.push(`\u{1F7E0} **High risk files:** ${highRisk.map((f) => `\`${f.file}\``).join(", ")}`, "");
    }
    if (criticalRisk.length === 0 && highRisk.length === 0) {
      lines.push("\u{1F7E2} **No high/critical risk files detected.**", "");
    }
    lines.push("");
    if (diffReview.changedRoutes.length > 0) {
      lines.push("### \u{1F6E3}\uFE0F Changed Routes", "");
      for (const r of diffReview.changedRoutes) lines.push(`- \`${r}\``);
      lines.push("");
    }
    if (diffReview.changedApis.length > 0) {
      lines.push("### \u{1F50C} Changed APIs", "");
      for (const a of diffReview.changedApis) lines.push(`- \`${a}\``);
      lines.push("");
    }
    if (diffReview.changedComponents.length > 0) {
      lines.push("### \u{1F9E9} Changed Components", "");
      lines.push("| Component |", "|-----------|");
      for (const c of diffReview.changedComponents) lines.push(`| \`${c}\` |`);
      lines.push("");
    }
    if (diffReview.topIntroducedRisks.length > 0) {
      lines.push("### \u{1F6A8} Top 5 Introduced Risks", "");
      const top5 = diffReview.topIntroducedRisks.slice(0, 5);
      for (const r of top5) {
        const severityLabel = r.severity.toUpperCase();
        const sevIcon = r.severity === "critical" ? "\u{1F534}" : r.severity === "high" ? "\u{1F7E0}" : r.severity === "medium" ? "\u{1F7E1}" : "\u{1F535}";
        const location = r.file ? ` \u2014 \`${r.file}${r.line ? `:${r.line}` : ""}\`` : "";
        lines.push(`${sevIcon} **${severityLabel}** ${r.title}${location}`);
        if (r.explanation) lines.push(`   ${r.explanation}`);
      }
      lines.push("");
    }
    if (diffReview.testCoverage) {
      const tc = diffReview.testCoverage;
      const statusIcon = tc.status === "adequate" ? "\u2705" : tc.status === "inadequate" ? "\u26A0\uFE0F" : tc.status === "missing" ? "\u274C" : "\u2796";
      const statusLabel = tc.status.replace("-", " ").toUpperCase();
      lines.push("### \u{1F9EA} Test Coverage Status", "");
      lines.push("| Category | Status | Details |", "|---|---|---|");
      const authBillingAdmin = tc.missingTestFiles.some(
        (f) => f.includes("auth/") || f.includes("billing/") || f.includes("admin/")
      );
      const featureTested = tc.testFilesChanged > 0 && tc.criticalFeaturesTested;
      const deletedTests = tc.deletedTestFiles.length > 0;
      lines.push(
        `| Auth/Billing/Admin changes | ${authBillingAdmin ? "\u26A0\uFE0F NO TESTS" : "\u2705 TESTED"} | ${authBillingAdmin ? "Critical path changed, no test files modified" : "Test files updated for critical paths"} |`,
        `| Feature code changes | ${featureTested ? "\u2705 TESTED" : "\u26A0\uFE0F PARTIAL"} | ${tc.testFilesChanged} test file(s) updated |`,
        `| Deleted tests | ${deletedTests ? "\u274C DELETED" : "\u2705 NONE"} | ${deletedTests ? tc.deletedTestFiles.join(", ") : "No test files deleted"} |`
      );
      lines.push("");
    }
    lines.push("### \u{1F527} Reproduction Commands", "");
    lines.push("```bash");
    lines.push("# Review this diff");
    lines.push(`turpan review . --from ${diffReview.baseRef} --to ${diffReview.targetRef}`);
    lines.push("");
    lines.push("# Deep diff analysis");
    lines.push(`turpan review . --from ${diffReview.baseRef} --to ${diffReview.targetRef} --deep`);
    lines.push("");
    lines.push("# Scoped agent audit");
    lines.push(`turpan agent-audit . --task ./task.md --from ${diffReview.baseRef} --to ${diffReview.targetRef}`);
    lines.push("```", "");
    if (diffReview.findingsIntroducedByDiff.length > 0) {
      lines.push("### \u{1F50D} Findings in Diff", "");
      for (const f of diffReview.findingsIntroducedByDiff) lines.push(`- ${f}`);
      lines.push("");
    }
    if (findings.length > 0) {
      lines.push("### \u{1F50E} Top Findings", "");
      const top = findings.slice(0, 10);
      for (const f of top) {
        const icon = f.severity === "critical" ? "\u{1F534}" : f.severity === "high" ? "\u{1F7E0}" : f.severity === "medium" ? "\u{1F7E1}" : "\u{1F535}";
        lines.push(`${icon} **${f.severity.toUpperCase()}** \`[${f.category}]\` ${f.title}`);
        if (f.file) lines.push(`   \u2514\u2500 ${f.file}${f.line ? `:${f.line}` : ""}`);
      }
      if (findings.length > 10) {
        lines.push(`_\u2026and ${findings.length - 10} more findings._`);
      }
      lines.push("");
    } else {
      lines.push("### \u{1F50E} Findings", "");
      lines.push("_No findings in this diff._", "");
    }
    lines.push("---", "");
    lines.push("_\u{1F916} Generated by [Turpan](https://github.com/turpan/turpan) \u2014 PR review agent_", "");
    return lines.join("\n");
  }
};

// src/DiffFindingsWriter.ts
import { join as join9 } from "path";
var DiffFindingsWriter = class {
  constructor(data) {
    this.data = data;
  }
  data;
  async write(runPath) {
    const { mkdirSync: mkdirSync2, writeFileSync } = await import("fs");
    const content = JSON.stringify(this.build(), null, 2);
    mkdirSync2(runPath, { recursive: true });
    const dest = join9(runPath, "TURPAN_DIFF_FINDINGS.json");
    writeFileSync(dest, content, "utf-8");
    return dest;
  }
  build() {
    const { runId, timestamp, projectPath, findings, verdict, scorecard, diffReview } = this.data;
    const diffMeta = {
      baseRef: diffReview?.baseRef ?? "unknown",
      targetRef: diffReview?.targetRef ?? "unknown",
      totalFiles: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesRenamed: 0,
      totalLinesAdded: 0,
      totalLinesDeleted: 0
    };
    const rec = diffReview?.recommendation ?? "request_changes";
    const breakdown = {
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      info: findings.filter((f) => f.severity === "info").length
    };
    const diffScopedTags = /* @__PURE__ */ new Set(["diff-scoped", "introduced-by-diff"]);
    const introducedFindings = findings.filter(
      (f) => f.tags?.some((t) => diffScopedTags.has(t)) || f.file != null && diffReview?.changedRoutes?.some((r) => f.file?.includes(r))
    );
    const preExistingFindings = findings.filter((f) => !introducedFindings.includes(f));
    const testCoverage = diffReview?.testCoverage ?? {
      status: "not-applicable",
      criticalFeaturesTested: false,
      testFilesChanged: 0,
      sourceFilesChanged: 0,
      missingTestFiles: [],
      deletedTestFiles: [],
      testsWithoutAssertions: []
    };
    const mergeDecision = diffReview?.mergeDecision ?? {
      decision: rec,
      blockers: [],
      warnings: []
    };
    return {
      version: "1.0.0",
      runId,
      timestamp,
      projectPath,
      verdict,
      overallScore: scorecard.overall,
      diff: diffMeta,
      recommendation: {
        decision: rec,
        confidence: diffReview?.confidence ?? "medium",
        summary: diffReview?.summary ?? "No diff review summary available.",
        reasons: diffReview?.findingsIntroducedByDiff ?? []
      },
      riskByFile: (diffReview?.riskByFile ?? []).map((rf) => ({
        file: rf.file,
        risk: rf.risk,
        reason: rf.reason,
        changeType: "modified",
        linesAdded: 0,
        linesDeleted: 0
      })),
      changedSurface: {
        routes: diffReview?.changedRoutes ?? [],
        apis: diffReview?.changedApis ?? [],
        components: diffReview?.changedComponents ?? [],
        ownership: []
      },
      diffFindings: findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        introducedBy: "modified"
      })),
      allFindings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        category: f.category,
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        suggestedFix: f.suggestedFix,
        fixable: f.fixable,
        confidence: f.confidence,
        tags: f.tags
      })),
      introducedFindings: introducedFindings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        introducedBy: "diff",
        confidence: f.confidence
      })),
      preExistingFindings: preExistingFindings.map((f) => ({
        id: f.id,
        title: f.title,
        file: f.file
      })),
      testCoverage,
      mergeDecision: {
        decision: mergeDecision.decision,
        confidence: diffReview?.confidence ?? "medium",
        blockers: mergeDecision.blockers,
        warnings: mergeDecision.warnings,
        mustFix: mergeDecision.blockers,
        niceToFix: mergeDecision.warnings
      },
      severityBreakdown: breakdown
    };
  }
};

// src/ReportOpenCommand.ts
import { join as join10 } from "path";
import { existsSync } from "fs";
var HTML_FILE = "TURPAN_ANALYSIS.html";
var MD_FILE = "TURPAN_ANALYSIS.md";
var ReportOpenCommand = class {
  /**
   * Open the report for the given run directory.
   * Returns the path that was opened, or undefined if nothing found.
   */
  static async open(runDir) {
    const open = (await import("open")).default;
    const target = runDir ?? this.latestRunPath();
    if (!target) {
      console.error("\u274C No run directory found. Run `turpan` first.");
      return void 0;
    }
    const htmlPath = join10(target, HTML_FILE);
    const mdPath = join10(target, MD_FILE);
    if (existsSync(htmlPath)) {
      await open(htmlPath, { wait: false });
      console.log(`\u2705 Opened: ${htmlPath}`);
      return htmlPath;
    }
    if (existsSync(mdPath)) {
      await open(mdPath, { wait: false });
      console.log(`\u2705 Opened: ${mdPath}`);
      return mdPath;
    }
    console.error(`\u274C No report found in ${target}`);
    return void 0;
  }
  /** Print the path to the latest run's report (no open). */
  static show() {
    const latest = this.latestRunPath();
    if (!latest) {
      console.log("No run found. Run `turpan` first.");
      return void 0;
    }
    const htmlPath = join10(latest, HTML_FILE);
    const mdPath = join10(latest, MD_FILE);
    if (existsSync(htmlPath)) {
      console.log(`\u{1F4C4} ${htmlPath}`);
      return htmlPath;
    }
    if (existsSync(mdPath)) {
      console.log(`\u{1F4C4} ${mdPath}`);
      return mdPath;
    }
    console.log(`No report found in ${latest}`);
    return void 0;
  }
  /** Resolve the path to `.turpan/runs/latest` */
  static latestRunPath() {
    const { TURPAN_RUNS = ".turpan/runs" } = process.env;
    const latest = join10(TURPAN_RUNS, "latest");
    return existsSync(latest) ? latest : void 0;
  }
  /** Resolve a specific run by ID or 'latest'. */
  static resolveRunPath(idOrLatest) {
    const { TURPAN_RUNS = ".turpan/runs" } = process.env;
    if (idOrLatest === "latest") {
      return join10(TURPAN_RUNS, "latest");
    }
    if (existsSync(idOrLatest)) return idOrLatest;
    return join10(TURPAN_RUNS, idOrLatest);
  }
};

// src/generateReports.ts
import { mkdirSync } from "fs";
async function generateReports(data) {
  const runPath = data.runPath;
  mkdirSync(runPath, { recursive: true });
  const mdWriter = new MarkdownReportWriter(data);
  const htmlWriter = new HtmlReportWriter(data);
  const jsonWriter = new JsonReportWriter(data);
  const scWriter = new ScorecardWriter(data);
  const evWriter = new EvidenceIndexWriter(data);
  const fpWriter = new FixPlanWriter(data);
  const rsWriter = new RunSummaryWriter(data);
  const baseResults = await Promise.all([
    mdWriter.write(runPath),
    htmlWriter.write(runPath),
    jsonWriter.write(runPath),
    scWriter.write(runPath),
    evWriter.write(runPath),
    fpWriter.write(runPath),
    rsWriter.write(runPath)
  ]);
  const [analysisMd, analysisHtml, findingsJson, scorecardJson, evidenceMd, fixPlanResult, runSummary] = baseResults;
  let prComment;
  let diffFindings;
  if (data.diffReview) {
    const prWriter = new PrCommentWriter(data);
    const dfWriter = new DiffFindingsWriter(data);
    [prComment, diffFindings] = await Promise.all([
      prWriter.write(runPath),
      dfWriter.write(runPath)
    ]);
  }
  return {
    analysisMd,
    analysisHtml,
    findingsJson,
    scorecardJson,
    fixPlanMd: fixPlanResult.fixPlanPath,
    patchDiff: fixPlanResult.patchPath,
    runSummary,
    evidenceMd,
    prComment,
    diffFindings
  };
}

// src/types.ts
function deriveVerdict(scorecard, findings) {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  if (critical > 0) return "NO_GO";
  if (high > 0) return "CONDITIONAL_GO";
  if (scorecard.overall < 70) return "CONDITIONAL_GO";
  if (scorecard.overall >= 90) return "GO";
  return "INTERNAL_ONLY";
}
export {
  DiffFindingsWriter,
  EvidenceIndexWriter,
  FixPlanWriter,
  HtmlReportWriter,
  JsonReportWriter,
  MarkdownReportWriter,
  PrCommentWriter,
  ReportOpenCommand,
  RunSummaryWriter,
  ScorecardWriter,
  deriveVerdict,
  generateReports
};
