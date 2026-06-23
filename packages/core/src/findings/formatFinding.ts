/**
 * Format a Finding for display (markdown, JSON, terminal)
 */

import type { Finding, Severity } from './Finding.js';
import type { Evidence } from './Evidence.js';
import { severityCode, SEVERITY_DESCRIPTIONS } from './severity.js';

export interface FormattedFinding {
  id: string;
  title: string;
  severity: Severity;
  severityCode: string;
  category: string;
  file?: string;
  line?: number;
  location: string;
  explanation: string;
  evidenceSummary: string;
  suggestedFix?: string;
  fixable: string;
  confidence: number;
  tags: string[];
}

export function formatFindingForDisplay(f: Finding): FormattedFinding {
  const location = f.file
    ? f.line ? `${f.file}:${f.line}` : f.file
    : '(no location)';

  const evidenceSummary = f.evidence.length === 0
    ? 'No evidence'
    : f.evidence.length === 1
    ? `[${f.evidence[0].type}] ${f.evidence[0].excerpt?.slice(0, 120) ?? ''}`
    : `[${f.evidence.length} evidence items]`;

  return {
    id: f.id,
    title: f.title,
    severity: f.severity,
    severityCode: severityCode(f.severity),
    category: f.category,
    file: f.file,
    line: f.line,
    location,
    explanation: f.explanation,
    evidenceSummary,
    suggestedFix: f.suggestedFix,
    fixable: f.fixable,
    confidence: f.confidence,
    tags: f.tags,
  };
}

export function formatFindingMarkdown(f: Finding): string {
  const ff = formatFindingForDisplay(f);
  const lines: string[] = [];

  lines.push(`### ${ff.severityCode} ${ff.title}`);
  lines.push('');
  lines.push(`**Category:** ${ff.category}  |  **Location:** \`${ff.location}\`  |  **Confidence:** ${ff.confidence}%`);
  if (ff.suggestedFix) lines.push(`**Fix:** ${ff.suggestedFix}`);
  if (ff.fixable !== 'none') lines.push(`**Fixable:** ${ff.fixable}`);
  lines.push('');
  lines.push(ff.explanation);
  lines.push('');

  if (ff.evidenceSummary !== 'No evidence') {
    lines.push(`> ${ff.evidenceSummary}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatFindingTableRow(f: Finding): string {
  const ff = formatFindingForDisplay(f);
  return `| ${ff.severityCode} | ${ff.category} | ${ff.title} | ${ff.location} | ${ff.fixable} |`;
}

export function formatEvidenceItem(e: Evidence, index: number): string {
  const lines: string[] = [];
  lines.push(`**Evidence ${index + 1}** \`[${e.type}]\`${e.label ? ` — ${e.label}` : ''}`);
  if (e.command) lines.push(`\`\`\`\n$ ${e.command}\n\`\`\``);
  if (e.excerpt) lines.push(`\`\`\`\n${e.excerpt}\n\`\`\``);
  if (e.path) lines.push(`File: \`${e.path}\``);
  if (e.value !== undefined && e.unit) lines.push(`Metric: ${e.value}${e.unit}`);
  if (e.timestamp) lines.push(`Collected: ${new Date(e.timestamp).toISOString()}`);
  return lines.join('\n');
}
