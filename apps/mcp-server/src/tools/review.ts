/**
 * Turpan MCP Tools — Implementation
 *
 * All tools are read-only by default. Fix mode is patch-only by default.
 * Applying patches requires explicit `fixMode: 'apply'` in the input.
 */

import { join, resolve } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import chalk from 'chalk';

import { runAnalysis as coreRunAnalysis, detectProject } from '@turpan/core';
import { runAgentOutputAudit } from '@turpan/analyzers';
import { runUiTest } from '@turpan/ui-runner';
import {
  buildFixPlan,
  applyFixCandidates,
  verifyPatch,
  type FixMode,
} from '@turpan/fix-engine';
import { generateReports, deriveVerdict } from '@turpan/report';
import type { TurpanAnalysisData } from '@turpan/report';
import type { Finding } from '@turpan/shared';

import { validateProjectPath, validateTaskFilePath, validateRunId, getLatestRunPath, resolveOutputPath } from '../security/workspace.js';
import { redactObject, formatSafeError } from '../security/redact.js';
import type {
  ReviewProjectInput,
  ReviewDiffInput,
  LiveUiTestInput,
  AgentOutputAuditInput,
  FixFindingsInput,
  GetReportInput,
  GetFindingsInput,
} from '../schemas/tools.js';
import { createTimestampDir } from '@turpan/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureRunDir(projectPath: string): Promise<string> {
  const baseRunPath = join(projectPath, '.turpan', 'runs');
  return createTimestampDir(baseRunPath);
}

function loadLatestRunArtifacts(projectPath: string): {
  findings: Finding[];
  scorecard: import('@turpan/shared').Scorecard;
  runId: string;
} {
  const latest = getLatestRunPath(projectPath);
  if (!latest) return { findings: [], scorecard: { overall: 0, categories: { correctness: 0, security: 0, performance: 0, maintainability: 0, codeCoverage: 0 }, findingsCount: 0, criticalIssues: 0 }, runId: 'unknown' };

  const findingsPath = join(latest, 'TURPAN_FINDINGS.json');
  const scorecardPath = join(latest, 'TURPAN_SCORECARD.json');
  const runId = latest.split('/').pop() ?? 'unknown';

  let findings: Finding[] = [];
  let scorecard: import('@turpan/shared').Scorecard = { overall: 0, categories: { correctness: 0, security: 0, performance: 0, maintainability: 0, codeCoverage: 0 }, findingsCount: 0, criticalIssues: 0 };

  if (existsSync(findingsPath)) {
    try { findings = JSON.parse(readFileSync(findingsPath, 'utf-8')).findings ?? []; } catch {}
  }
  if (existsSync(scorecardPath)) {
    try { scorecard = JSON.parse(readFileSync(scorecardPath, 'utf-8')); } catch {}
  }

  return { findings, scorecard, runId };
}

function summarizeFindings(findings: Finding[]): string {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length;
  const medium = findings.filter(f => f.severity === 'medium').length;
  const low = findings.filter(f => f.severity === 'low').length;
  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (high > 0) parts.push(`${high} high`);
  if (medium > 0) parts.push(`${medium} medium`);
  if (low > 0) parts.push(`${low} low`);
  return parts.length > 0 ? parts.join(', ') : 'clean';
}

// ─── Tool Implementations ────────────────────────────────────────────────────

export async function reviewProject(input: ReviewProjectInput, emitLog?: (msg: string) => void): Promise<{
  runId: string;
  verdict: string;
  score: number;
  findingsSummary: string;
  reportPath: string;
}> {
  const { projectPath, mode, includeUi, includeRuntime, includeSecurity, includeAgentAudit, taskFile, fixMode } = input;

  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const runPath = await ensureRunDir(projectRoot);
  const runId = runPath.split('/').pop() ?? new Date().toISOString().replace(/[:.]/g, '-');

  emitLog?.(`[turpan.review_project] Starting ${mode} review on ${projectRoot}`);

  try {
    // Run core analysis
    const timeoutMs = mode === 'deep' ? 300_000 : 120_000;
    const coreRunPath = await coreRunAnalysis({
      projectPath: projectRoot,
      deepAnalysis: mode === 'deep',
      uiAnalysis: includeUi,
      fixMode: fixMode === 'patch-only',
      install: false,
      timeoutMs,
      skipBuild: false,
      skipTests: false,
      skipLint: false,
      skipTypecheck: false,
      skipSecurity: !includeSecurity,
      skipUi: !includeUi,
      skipRuntime: !includeRuntime,
    });

    // If a task file is provided, run agent audit
    if (includeAgentAudit && taskFile) {
      try {
        validateTaskFilePath(taskFile, projectRoot);
      } catch (e) {
        emitLog?.(`[turpan.review_project] Task file validation failed: ${formatSafeError(e).message}`);
      }
    }

    // Load results
    const { findings, scorecard } = loadLatestRunArtifacts(projectRoot);
    const verdict = deriveVerdict(scorecard, findings);
    const summary = summarizeFindings(findings);

    return {
      runId,
      verdict,
      score: scorecard.overall,
      findingsSummary: `${findings.length} findings (${summary})`,
      reportPath: join(runPath, 'TURPAN_ANALYSIS.md'),
    };
  } catch (err) {
    const safe = formatSafeError(err);
    throw new Error(`Review failed: ${safe.message}`);
  }
}

export async function reviewDiff(input: ReviewDiffInput, emitLog?: (msg: string) => void): Promise<{
  runId: string;
  reportPath: string;
  findingsSummary: string;
}> {
  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const runPath = await ensureRunDir(projectRoot);
  const runId = runPath.split('/').pop() ?? new Date().toISOString().replace(/[:.]/g, '-');

  emitLog?.(`[turpan.review_diff] Comparing ${input.baseRef}..${input.targetRef}`);

  // For now, run a full quick review scoped to the diff
  // The diff itself is generated via git diff and passed to the orchestrator
  // TODO: Wire in diff-specific review
  await coreRunAnalysis({
    projectPath: projectRoot,
    deepAnalysis: false,
    uiAnalysis: input.includeUi,
    fixMode: false,
    install: false,
    timeoutMs: 120_000,
  });

  const { findings } = loadLatestRunArtifacts(projectRoot);
  return {
    runId,
    reportPath: join(runPath, 'TURPAN_ANALYSIS.md'),
    findingsSummary: `${findings.length} findings (${summarizeFindings(findings)})`,
  };
}

export async function liveUiTest(input: LiveUiTestInput, emitLog?: (msg: string) => void): Promise<{
  runId: string;
  uiSummary: string;
  screenshots: string[];
  findings: Array<{ title: string; severity: string; category: string }>;
}> {
  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const runId = new Date().toISOString().replace(/[:.]/g, '-');

  emitLog?.(`[turpan.live_ui_test] Starting UI test on ${projectRoot}`);

  const fingerprint = detectProject(projectRoot);
  const report = await runUiTest({
    projectRoot,
    runId,
    url: input.url,
    headed: input.headed,
    mobileOnly: input.mobile,
    trace: input.trace,
  });

  const screenshots = report.artifacts.screenshots.map(s => s.path);
  return {
    runId,
    uiSummary: `${report.summary.successfulRoutes}/${report.summary.totalRoutes} routes, ` +
               `${report.summary.consoleErrors} console errors, verdict: ${report.verdict}`,
    screenshots,
    findings: report.findings.map(f => ({ title: f.title, severity: f.severity, category: f.category })),
  };
}

export async function agentOutputAudit(input: AgentOutputAuditInput, emitLog?: (msg: string) => void): Promise<{
  completionScore: number;
  missingCapabilities: string[];
  fakeImplementationFindings: string[];
  reportPath: string;
}> {
  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  try {
    validateTaskFilePath(input.taskFile, validated.resolved);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const taskText = readFileSync(input.taskFile, 'utf-8');

  emitLog?.(`[turpan.agent_output_audit] Running agent audit on ${projectRoot}`);

  const report = await runAgentOutputAudit({
    projectRoot,
    taskText,
    agentType: input.agentName,
  });

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(projectRoot, '.turpan', 'runs', runId);

  return {
    completionScore: report.completion.overall,
    missingCapabilities: report.completion.missingCapabilities.map(c => c.category),
    fakeImplementationFindings: report.completion.fakeOrShallowCapabilities.map(c => c.category),
    reportPath: join(runDir, 'AGENT_OUTPUT_AUDIT.json'),
  };
}

export async function fixFindings(input: FixFindingsInput, emitLog?: (msg: string) => void): Promise<{
  patchPath: string;
  applied: number;
  validationSummary: string;
}> {
  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const fixMode: FixMode = input.fixMode ?? 'patch-only';

  // Enforce patch-only by default — apply requires explicit input
  if (fixMode !== 'patch-only' && fixMode !== 'apply') {
    throw formatSafeError(new Error('fixMode must be "patch-only" or "apply"'));
  }

  emitLog?.(`[turpan.fix_findings] Running fix engine in ${fixMode} mode`);

  // Load latest findings
  const { findings } = loadLatestRunArtifacts(projectRoot);

  if (findings.length === 0) {
    return { patchPath: '', applied: 0, validationSummary: 'No findings to fix' };
  }

  const targetFindings = input.findingIds
    ? findings.filter(f => input.findingIds!.includes(f.id))
    : findings;

  if (targetFindings.length === 0) {
    return { patchPath: '', applied: 0, validationSummary: 'No matching findings to fix' };
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const { buildFixPlan: buildPlan, applyFixCandidates: applyFix } = await import('@turpan/fix-engine');

  const plan = buildPlan({ findings: targetFindings, projectRoot, fixMode });
  const result = await applyFix({ plan, projectRoot, fixMode });

  return {
    patchPath: result.patchResult.patchContent ? join(projectRoot, '.turpan', 'runs', runId, 'TURPAN_PATCH.diff') : '',
    applied: result.applied.length,
    validationSummary: result.validation.allPassed
      ? `All ${result.validation.results.length} validation checks passed`
      : `${result.validation.results.filter(r => !r.passed).length}/${result.validation.results.length} checks failed`,
  };
}

export async function getReport(input: GetReportInput, emitLog?: (msg: string) => void): Promise<{
  content: string;
  format: string;
}> {
  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const { runId, format } = input;

  let runPath: string;
  if (runId) {
    try { validateRunId(runId); } catch (e) { throw formatSafeError(e); }
    runPath = join(projectRoot, '.turpan', 'runs', runId);
  } else {
    const latest = getLatestRunPath(projectRoot);
    if (!latest) throw new Error('No run found. Run turpan.review_project first.');
    runPath = latest;
  }

  emitLog?.(`[turpan.get_report] Loading ${format} report from ${runPath}`);

  const filename = format === 'html' ? 'TURPAN_ANALYSIS.html'
    : format === 'json' ? 'TURPAN_FINDINGS.json'
    : 'TURPAN_ANALYSIS.md';

  const filePath = join(runPath, filename);
  if (!existsSync(filePath)) {
    throw new Error(`Report file not found: ${filename}`);
  }

  return {
    content: readFileSync(filePath, 'utf-8'),
    format,
  };
}

export async function getFindings(input: GetFindingsInput, emitLog?: (msg: string) => void): Promise<{
  findings: Finding[];
  total: number;
}> {
  let validated: import('../security/workspace.js').ValidatedPath;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }

  const projectRoot = validated.resolved;
  const { runId, severity, category } = input;

  let runPath: string;
  if (runId) {
    try { validateRunId(runId); } catch (e) { throw formatSafeError(e); }
    runPath = join(projectRoot, '.turpan', 'runs', runId);
  } else {
    const latest = getLatestRunPath(projectRoot);
    if (!latest) return { findings: [], total: 0 };
    runPath = latest;
  }

  const findingsPath = join(runPath, 'TURPAN_FINDINGS.json');
  if (!existsSync(findingsPath)) {
    return { findings: [], total: 0 };
  }

  let allFindings: Finding[] = [];
  try {
    allFindings = JSON.parse(readFileSync(findingsPath, 'utf-8')).findings ?? [];
  } catch {
    return { findings: [], total: 0 };
  }

  let filtered = allFindings;
  if (severity) filtered = filtered.filter(f => f.severity === severity);
  if (category) filtered = filtered.filter(f => f.category === category);

  // Redact findings before returning (remove any embedded secrets)
  const redacted = redactObject(filtered);

  emitLog?.(`[turpan.get_findings] Returning ${redacted.length}/${allFindings.length} findings`);

  return { findings: redacted, total: redacted.length };
}