/**
 * HtmlReportWriter — produces TURPAN_ANALYSIS.html
 *
 * Self-contained static HTML page. Works offline from the run directory.
 * Includes:
 *   - Severity / category filter chips
 *   - Screenshot gallery with lightbox
 *   - Scorecard gauges
 *   - Collapsible evidence excerpts
 *   - Fix plan table
 *   - All sections mirrored from the markdown report
 */

import { join } from 'path';
import type {
  TurpanAnalysisData,
  Verdict,
  EvidenceFile,
} from './types.js';

export class HtmlReportWriter {
  constructor(private data: TurpanAnalysisData) {}

  async write(runPath: string): Promise<string> {
    const { writeFileSync } = await import('fs');
    const content = this.render();
    const dest    = join(runPath, 'TURPAN_ANALYSIS.html');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  render(): string {
    const d = this.data;
    const counts = severityCounts(d.findings);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Turpan Analysis — ${d.runId}</title>
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

  /* ── Header ── */
  .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
  .header h1 { font-size: 1.6rem; letter-spacing: -0.02em; }
  .run-id { color: var(--muted); font-family: var(--mono); font-size: 0.8rem; }

  /* ── Verdict banner ── */
  .verdict {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 1rem; border-radius: 6px; font-weight: 700; font-size: 1.1rem;
    margin-bottom: 1.5rem;
  }
  .verdict.GO        { background: #23863622; color: #3fb950; border: 1px solid #3fb95055; }
  .verdict.CONDITIONAL_GO { background: #d2992222; color: #f0883e; border: 1px solid #f0883e55; }
  .verdict.NO_GO     { background: #f8514922; color: #f85149; border: 1px solid #f8514955; }
  .verdict.INTERNAL_ONLY { background: #58a6ff22; color: #58a6ff; border: 1px solid #58a6ff55; }

  /* ── Sections ── */
  h2 { font-size: 1.1rem; color: var(--text); margin: 2rem 0 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border); }
  h3 { font-size: 0.95rem; color: var(--muted); margin: 1.2rem 0 0.4rem; }
  p, li { color: var(--text); }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
  th { text-align: left; padding: 0.4rem 0.75rem; background: var(--surface); color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
  td { padding: 0.4rem 0.75rem; border-bottom: 1px solid #21262d; vertical-align: top; }
  tr:hover td { background: #161b22; }

  /* ── Scorecard grid ── */
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

  /* ── Severity counts ── */
  .severity-row { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
  .sev-chip { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
  .sev-critical { background: #f8514922; color: var(--critical); }
  .sev-high     { background: #f0883e22; color: var(--high); }
  .sev-medium   { background: #d2992222; color: var(--medium); }
  .sev-low      { background: #3fb95022; color: var(--low); }
  .sev-info     { background: #58a6ff22; color: var(--info); }

  /* ── Findings ── */
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

  /* ── Filter chips ── */
  .filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.75rem 0; }
  .filter-chip {
    padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.78rem; cursor: pointer;
    border: 1px solid var(--border); background: var(--surface); color: var(--muted);
    transition: all 0.15s;
  }
  .filter-chip:hover { border-color: var(--text); color: var(--text); }
  .filter-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  /* ── Screenshots gallery ── */
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; margin: 0.75rem 0; }
  .gallery-item { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .gallery-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #000; }
  .gallery-caption { padding: 0.4rem 0.6rem; font-size: 0.78rem; color: var(--muted); font-family: var(--mono); }

  /* ── Collapsible evidence ── */
  .collapsible { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin: 0.3rem 0; overflow: hidden; }
  .collapsible-header { padding: 0.5rem 0.75rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--muted); user-select: none; }
  .collapsible-header:hover { background: #1c2128; color: var(--text); }
  .collapsible-header::after { content: '▶'; font-size: 0.6rem; transition: transform 0.2s; }
  .collapsible.open .collapsible-header::after { transform: rotate(90deg); }
  .collapsible-body { display: none; padding: 0.5rem 0.75rem; font-family: var(--mono); font-size: 0.78rem; color: var(--muted); background: #0d1117; border-top: 1px solid var(--border); white-space: pre-wrap; word-break: break-all; }
  .collapsible.open .collapsible-body { display: block; }

  /* ── Fix plan ── */
  .fix-applied  { color: #3fb950; }
  .fix-rejected { color: #f85149; }
  .fix-deferred { color: #d29922; }

  /* ── Validation ── */
  .val-pass { color: #3fb950; }
  .val-fail { color: #f85149; }

  /* ── Agent audit bars ── */
  .audit-bar { display: flex; gap: 0.3rem; align-items: center; margin: 0.2rem 0; }
  .audit-pct { font-size: 0.8rem; font-weight: 700; min-width: 3ch; text-align: right; }

  /* ── Footer ── */
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    body { padding: 1rem; }
    .scorecard-grid { grid-template-columns: repeat(2, 1fr); }
    .gallery { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="container">

<!-- ── Header ── -->
<div class="header">
  <h1>🏛️ Turpan Analysis</h1>
  <span class="run-id">${d.runId}</span>
</div>

<!-- ── Verdict ── -->
<div class="verdict ${d.verdict}">
  ${verdictIcon(d.verdict)} ${d.verdict.replace('_', ' ')}
</div>

<!-- ── Executive Summary ── -->
<h2>Executive Summary</h2>
<ul>
${executiveSummaryItems(d).map(item => `  <li>${item}</li>`).join('\n')}
</ul>

<!-- ── Scorecard ── -->
<h2>Scorecard</h2>
<div class="scorecard-grid">
${scorecardCells(d).join('\n')}
</div>
<div class="severity-row">
  <span class="sev-chip sev-critical">🔴 ${counts.critical} Critical</span>
  <span class="sev-chip sev-high">🟠 ${counts.high} High</span>
  <span class="sev-chip sev-medium">🟡 ${counts.medium} Medium</span>
  <span class="sev-chip sev-low">🟢 ${counts.low} Low</span>
  <span class="sev-chip sev-info">🔵 ${counts.info} Info</span>
</div>

<!-- ── Findings filter ── -->
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
${renderFindings(d.findings).join('\n')}
</div>

<!-- ── Live UI Review ── -->
${d.uiReview ? renderUiReview(d.uiReview) : ''}

<!-- ── Code Quality ── -->
${d.codeQuality ? renderCodeQuality(d.codeQuality) : ''}

<!-- ── Security ── -->
${d.security ? renderSecurity(d.security) : ''}

<!-- ── Dependency Audit ── -->
${d.dependencyAudit ? renderDependencyAudit(d.dependencyAudit) : ''}

<!-- ── Authenticated SaaS Review ── -->
${d.authenticatedSaas ? renderAuthenticatedSaas(d.authenticatedSaas) : ''}

<!-- ── Agent Output Audit ── -->
${d.agentAudit ? renderAgentAudit(d.agentAudit) : ''}

<!-- ── Fix Plan ── -->
${d.fixRunResult ? renderFixPlan(d.fixRunResult) : ''}

<!-- ── Validation Results ── -->
${d.validation ? renderValidation(d.validation) : ''}

<!-- ── Evidence Index ── -->
<h2>Evidence Index</h2>
${renderEvidenceIndex(d.runPath)}

<!-- ── Footer ── -->
<div class="footer">
  Generated by Turpan · ${new Date(d.timestamp).toLocaleString()} · ${d.duration}ms
</div>
</div>

<script>
// ── Filter chips ──
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

// ── Collapsibles ──
document.querySelectorAll('.collapsible-header').forEach(h => {
  h.addEventListener('click', () => {
    h.parentElement?.classList.toggle('open');
  });
});
</script>
</body>
</html>`;
  }
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function scorecardCells(d: TurpanAnalysisData): string[] {
  const { scorecard } = d;
  const cells: string[] = [];
  const overall = scorecard.overall ?? 0;

  const add = (label: string, score: number) => {
    const pct = Math.round(score);
    const hue = score > 80 ? '120' : score > 60 ? '45' : score > 40 ? '20' : '0';
    cells.push(`<div class="scorecard-cell">
  <div class="scorecell-label">${label}</div>
  <div class="scorecell-value" style="color: hsl(${hue},70%,55%)">${score}</div>
  <div class="scorecell-max">/100</div>
  <div class="scorecell-bar"><div class="scorecell-fill" style="width:${pct}%;background:hsl(${hue},70%,55%)"></div></div>
</div>`);
  };

  add('Overall', overall);
  if (scorecard.categories) {
    add('Build',       scorecard.categories.correctness    ?? overall);
    add('Test',        scorecard.categories.codeCoverage   ?? overall);
    add('Quality',     scorecard.categories.maintainability ?? overall);
    add('Security',    scorecard.categories.security        ?? overall);
    add('Performance', scorecard.categories.performance    ?? overall);
  }

  return cells;
}

function executiveSummaryItems(d: TurpanAnalysisData): string[] {
  const { findings, scorecard, verdict } = d;
  const items: string[] = [];
  const counts = severityCounts(findings);

  if (verdict === 'GO')       items.push(`✅ <strong>GO</strong> — score ${scorecard.overall}/100`);
  else if (verdict === 'CONDITIONAL_GO') items.push(`⚠️ <strong>CONDITIONAL_GO</strong> — ${counts.high} high, ${counts.medium} medium findings`);
  else if (verdict === 'NO_GO') items.push(`❌ <strong>NO_GO</strong> — ${counts.critical} critical findings must be resolved`);
  else items.push(`🔒 <strong>INTERNAL_ONLY</strong> — not ready for external deployment`);

  items.push(`Overall score: <strong>${scorecard.overall}/100</strong>`);
  if (counts.critical > 0) items.push(`🔴 ${counts.critical} critical finding${counts.critical !== 1 ? 's' : ''}`);
  if (counts.high > 0)     items.push(`🟠 ${counts.high} high severity finding${counts.high !== 1 ? 's' : ''}`);
  if (findings.length === 0) items.push('✅ Clean run — no findings');
  if (scorecard.categories) {
    const overall = scorecard.overall ?? 0;
    items.push(`Build health: <strong>${scorecard.categories.correctness ?? overall}/100</strong>`);
    items.push(`Security: <strong>${scorecard.categories.security ?? overall}/100</strong>`);
  }

  return items;
}

function renderFindings(findings: import('@turpan/core').Finding[]): string[] {
  if (findings.length === 0) return ['<p style="color:var(--muted)">No findings.</p>'];

  return findings.map(f => {
    const sevColor = { critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', info: 'var(--info)' }[f.severity];
    const evidence = f.evidence.map(e =>
      `<div class="evidence-item">${e.label ?? e.type}: ${e.excerpt ?? e.path ?? ''}</div>`
    ).join('');

    return `<div class="finding" data-sev="${f.severity}">
  <div class="finding-header">
    <span class="finding-sev" style="background:${sevColor}"></span>
    <span class="finding-title">${escHtml(f.title)}</span>
  </div>
  ${f.file ? `<div class="finding-file">${escHtml(f.file)}${f.line ? ':' + f.line : ''}</div>` : ''}
  <div class="finding-body">${escHtml(f.explanation)}</div>
  ${f.suggestedFix ? `<div class="finding-body"><strong>Fix:</strong> ${escHtml(f.suggestedFix)}</div>` : ''}
  ${evidence ? `<div style="margin-top:0.4rem">${evidence}</div>` : ''}
</div>`;
  });
}

function renderUiReview(ui: import('./types.js').LiveUiReview): string {
  const screenshots = ui.screenshots.length > 0
    ? `<div class="gallery">${ui.screenshots.map(s => `
      <div class="gallery-item">
        <img class="gallery-img" src="${escAttr(s.path)}" alt="${escAttr(s.label ?? s.route)}" loading="lazy">
        <div class="gallery-caption">${escHtml(s.label ?? s.route)}</div>
      </div>`).join('')}</div>`
    : '<p style="color:var(--muted)">No screenshots captured.</p>';

  const consoleErrs = ui.consoleErrors.length > 0
    ? ui.consoleErrors.map(e => `<li><code>${escHtml(e.route)}</code>: ${escHtml(e.message)} (×${e.count})</li>`).join('')
    : '<li>✅ No console errors</li>';

  const netErrs = ui.networkErrors.length > 0
    ? ui.networkErrors.map(e => `<li><code>${escHtml(e.route)}</code> [${e.status}] ${escHtml(e.url)} (×${e.count})</li>`).join('')
    : '<li>✅ No network errors</li>';

  return `
<h2>Live UI Review</h2>
<p><strong>Routes tested:</strong> ${ui.routesTested.join(', ') || 'none'}</p>
<h3>Screenshots</h3>
${screenshots}
<h3>Console Errors</h3><ul>${consoleErrs}</ul>
<h3>Network Errors</h3><ul>${netErrs}</ul>
${ui.interactionFindings.length > 0 ? `<h3>Interaction Findings</h3><ul>${ui.interactionFindings.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>` : ''}
${ui.mobileFindings.length > 0 ? `<h3>Mobile Findings</h3><ul>${ui.mobileFindings.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>` : ''}
`;
}

function renderCodeQuality(cq: import('./types.js').CodeQualityReview): string {
  const sections: Array<[string, string[]]> = [
    ['Maintainability',     cq.maintainability],
    ['Dead Code',           cq.deadCode],
    ['Duplicate Code',      cq.duplicateCode],
    ['Complexity',          cq.complexity],
    ['Unused Dependencies', cq.unusedDependencies],
  ];

  return `<h2>Code Quality Review</h2>
${sections.map(([title, items]) => `
<h3>${title}</h3>
${items.length === 0 ? '<p style="color:var(--muted)">No issues detected.</p>'
  : `<ul>${items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`}
`).join('')}`;
}

function renderSecurity(sec: import('./types.js').SecurityReview): string {
  const sections: Array<[string, string[]]> = [
    ['Secrets',         sec.secrets],
    ['Authentication',  sec.auth],
    ['CORS',            sec.cors],
    ['Injection Risks', sec.injectionRisks],
    ['MCP/Tool Risks',  sec.mcpToolRisks],
  ];

  return `<h2>Security Review</h2>
${sections.map(([title, items]) => `
<h3>${title}</h3>
${items.length === 0 ? '<p style="color:var(--muted)">No issues detected.</p>'
  : `<ul>${items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`}
`).join('')}`;
}

function renderDependencyAudit(da: import('./types.js').DependencyAuditSection): string {
  const modeBadge = da.mode === 'online' ? '🌐 ONLINE' : '📦 OFFLINE';
  const sevColor = (sev: string) =>
    sev === 'critical' ? '#dc2626' :
    sev === 'high' ? '#f97316' :
    sev === 'medium' ? '#eab308' : '#3b82f6';

  const vulnRows = da.vulnerabilities.map(v => `
    <tr>
      <td><code>${escHtml(v.name)}</code></td>
      <td><code>${escHtml(v.version)}</code></td>
      <td><span style="color:${sevColor(v.severity)};font-weight:bold">${v.severity.toUpperCase()}</span></td>
      <td>${escHtml(v.cveId ?? '—')}</td>
      <td>${v.source}</td>
      <td>${escHtml(v.title)}${v.exploitedInWild ? ' ⚠️ exploited' : ''}</td>
    </tr>`).join('');

  const licViolations = da.licenses.filter(l => l.policyViolation).map(l => `
    <tr>
      <td><code>${escHtml(l.name)}</code></td>
      <td>${escHtml(l.license ?? '(missing)')}</td>
      <td style="color:#dc2626">HIGH</td>
      <td>${escHtml(l.reason)}</td>
    </tr>`).join('');

  const licWarnings = da.licenses.filter(l => !l.policyViolation && l.risk !== 'none').map(l => `
    <tr>
      <td><code>${escHtml(l.name)}</code></td>
      <td>${escHtml(l.license ?? '(missing)')}</td>
      <td style="color:${l.risk === 'high' ? '#f97316' : '#eab308'}">${l.risk.toUpperCase()}</td>
      <td>${escHtml(l.reason)}</td>
    </tr>`).join('');

  const errorList = da.errors.length > 0 ? `
    <h3>Audit Errors</h3>
    <ul>${da.errors.map(e => `<li>⚠️ ${escHtml(e)}</li>`).join('')}</ul>` : '';

  const limitList = da.limitations.length > 0 ? `
    <h3>Limitations</h3>
    <ul>${da.limitations.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>` : '';

  return `<h2>Dependency Audit</h2>
<p><strong>Mode:</strong> ${modeBadge}</p>
<p><strong>Artifacts:</strong> Internal SBOM: <code>${escHtml(da.sbomPath)}</code> · CycloneDX SBOM: <code>${escHtml(da.sbomCdxPath)}</code></p>

<h3>Inventory</h3>
<ul>
  <li>Total components: <strong>${da.componentCount}</strong></li>
  <li>Direct deps: <strong>${da.directCount}</strong></li>
  <li>Transitive deps: <strong>${da.transitiveCount}</strong></li>
</ul>

<h3>Vulnerabilities</h3>
${da.vulnerabilities.length === 0
  ? '<p style="color:var(--muted)">No known vulnerabilities found.</p>'
  : `<table class="findings-table">
    <thead><tr><th>Package</th><th>Version</th><th>Severity</th><th>CVE</th><th>Source</th><th>Title</th></tr></thead>
    <tbody>${vulnRows}</tbody>
  </table>`}

<h3>License Audit</h3>
${da.licenses.length === 0
  ? '<p style="color:var(--muted)">No license issues detected.</p>'
  : `${licViolations || licWarnings
      ? `<table class="findings-table">
        <thead><tr><th>Package</th><th>License</th><th>Risk</th><th>Reason</th></tr></thead>
        <tbody>${licViolations}${licWarnings}</tbody>
      </table>`
      : '<p style="color:var(--muted)">All dependencies have permissive licenses.</p>'}`}

${errorList}
${limitList}`;
}

function renderAuthenticatedSaas(sa: import('./types.js').AuthenticatedSaasSection): string {
  const color = (v: string) => {
    if (v === 'passed' || v === 'usable' || v === 'wired' || v === 'protected' || v === 'redirected') return '#10b981';
    if (v === 'warn' || v === 'partially_usable' || v === 'noop_save' || v === 'fake_success') return '#f59e0b';
    if (v === 'failed' || v === 'broken' || v === 'empty' || v === 'unprotected_unauth' || v === 'unprotected_authed' || v === 'unprotected') return '#dc2626';
    return '#6b7280';
  };

  const testUserBadge = sa.testUserEnabled ? '<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;">ENABLED</span>'
    : '<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;">DISABLED (dry-run)</span>';

  if (!sa.testUserEnabled) {
    return `<h2>Authenticated SaaS Review</h2>
<p>${testUserBadge} &mdash; Authenticated scenarios ran in dry-run mode.</p>
<p><em>Login forms were inspected but NOT submitted. To enable real seeded login, set <code>ui.testUser.enabled: true</code> in <code>turpan.yml</code> with a test user account.</em></p>
<h3>Limitations</h3>
<ul>${sa.limitations.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`;
  }

  const row = (label: string, value: string) =>
    `<tr><td>${escHtml(label)}</td><td><span style="color:${color(value)};font-weight:bold">${escHtml(value.toUpperCase())}</span></td></tr>`;

  return `<h2>Authenticated SaaS Review</h2>
<p>${testUserBadge}</p>

<h3>Status</h3>
<table class="findings-table">
  <thead><tr><th>Check</th><th>Status</th></tr></thead>
  <tbody>
    ${row('Login', sa.loginStatus)}
    ${row('Protected Routes', sa.protectedRouteBehavior)}
    ${row('Admin (unauthenticated)', sa.adminAccess)}
    ${row('Dashboard', sa.dashboardUsability)}
    ${row('Settings', sa.settingsBehavior)}
    ${row('Billing Test Mode', sa.billingBehavior)}
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
<ul>${sa.limitations.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`;
}

function renderAgentAudit(audit: import('./types.js').AgentOutputAudit): string {
  const score = audit.completionScore;
  const pct   = score;
  const hue   = score > 80 ? '120' : score > 60 ? '45' : '20';
  const rec   = audit.recommendation ?? 'UNKNOWN';
  const conf  = audit.confidenceLevel ?? 'medium';
  const ic    = audit.issuesCount ?? { critical: 0, high: 0, medium: 0, low: 0 };

  return `<h2>Agent Output Audit</h2>
<div class="audit-bar">
  <span class="audit-pct" style="color:hsl(${hue},70%,55%)">${score}</span>
  <div class="scorecell-bar" style="flex:1"><div class="scorecell-fill" style="width:${pct}%;background:hsl(${hue},70%,55%)"></div></div>
  <span>Completion Score</span>
  <span style="margin-left:1rem;font-weight:600">${rec}</span>
  <span style="margin-left:.5rem;color:var(--muted)">confidence: ${conf}</span>
</div>
<div style="display:flex;gap:1rem;margin:.5rem 0">
  <span style="color:#ef4444">● ${ic.critical} critical</span>
  <span style="color:#f97316">● ${ic.high} high</span>
  <span style="color:#eab308">● ${ic.medium} medium</span>
  <span style="color:#22c55e">● ${ic.low} low</span>
</div>
<h3>Requested Capabilities</h3>
<ul>${audit.requestedCapabilities.length === 0 ? '<li style="color:var(--muted)">None detected in task</li>' : audit.requestedCapabilities.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>
<h3>Implemented</h3>
<ul>${audit.implementedCapabilities.length === 0 ? '<li style="color:var(--muted)">None detected</li>' : audit.implementedCapabilities.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>
<h3>Missing</h3>
${audit.missingCapabilities.length === 0
  ? '<p style="color:var(--muted)">None — all requested capabilities are implemented.</p>'
  : `<ul>${audit.missingCapabilities.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>`}
<h3>Fake / Shallow Implementations</h3>
${audit.fakeShallowImpls.length === 0
  ? '<p style="color:var(--muted)">None detected.</p>'
  : `<ul>${audit.fakeShallowImpls.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>`}
`;
}

function renderFixPlan(fr: import('@turpan/fix-engine').FixRunResult): string {
  const applied  = fr.applied.filter(r => r.decision === 'applied');
  const rejected = fr.rejected.filter(r => r.rejectionReason !== 'user-declined');
  const deferred = fr.deferred;

  const rows = [
    ...applied.map(r => `<tr><td class="fix-applied">✅</td><td>${r.candidateId}</td><td>applied</td><td>${r.validation?.allPassed ? '<span class="val-pass">passed</span>' : '<span class="val-fail">failed</span>'} (${r.validation?.totalDurationMs ?? 0}ms)</td></tr>`),
    ...rejected.map(r => `<tr><td class="fix-rejected">⚠️</td><td>${r.candidateId}</td><td>rejected</td><td>${r.rejectionReason ?? ''}</td></tr>`),
    ...deferred.map(r => `<tr><td class="fix-deferred">⏳</td><td>${r.candidateId}</td><td>deferred</td><td></td></tr>`),
  ];

  return `<h2>Fix Plan</h2>
<table>
  <tr><th></th><th>Candidate</th><th>Decision</th><th>Detail</th></tr>
  ${rows.join('\n')}
</table>
<h3>Patch Diff</h3>
<pre style="background:#0d1117;border:1px solid var(--border);border-radius:6px;padding:0.75rem;overflow:auto;font-family:var(--mono);font-size:0.78rem;color:var(--muted)">${escHtml(fr.patchResult?.patchContent ?? 'No patch generated.')}</pre>
`;
}

function renderValidation(val: import('./types.js').ValidationResults): string {
  type V = NonNullable<typeof val.build>;
  const raw: Array<[string, V | undefined]> = [
    ['Build',      val.build    as V | undefined],
    ['Test',       val.test     as V | undefined],
    ['Lint',       val.lint     as V | undefined],
    ['Typecheck',  val.typecheck as V | undefined],
    ['UI',         val.ui       as V | undefined],
  ];
  const checks: Array<[string, V]> = [];
  for (const entry of raw) {
    if (entry[1] !== undefined) checks.push([entry[0], entry[1] as V]);
  }

  return `<h2>Validation Results</h2>
<table>
  <tr><th>Check</th><th>Status</th><th>Duration</th><th>Output</th></tr>
  ${checks.map(([label, check]) => `
  <tr>
    <td>${label}</td>
    <td class="${check.passed ? 'val-pass' : 'val-fail'}">${check.passed ? '✅ Pass' : '❌ Fail'}</td>
    <td>${check.durationMs}ms</td>
    <td><pre style="font-size:0.75rem;color:var(--muted);white-space:pre-wrap">${escHtml(check.output ?? check.error ?? '')}</pre></td>
  </tr>`).join('')}
</table>`;
}

function renderEvidenceIndex(runPath: string): string {
  // Evidence index is rendered lazily to avoid FS reads in render()
  // The static page falls back to a placeholder; JS could lazy-load
  return `<p style="color:var(--muted);font-size:0.82rem">
  Evidence files are indexed at
  <code>.turpan/runs/&lt;runId&gt;/</code>.
  Open the run directory to browse logs, screenshots, and traces.
</p>`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function verdictIcon(v: Verdict): string {
  return { GO: '✅', CONDITIONAL_GO: '⚠️', NO_GO: '❌', INTERNAL_ONLY: '🔒' }[v];
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

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}