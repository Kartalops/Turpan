/**
 * Turpan MCP Tools — Implementation
 *
 * All tools are read-only by default. Fix mode is patch-only by default.
 * Applying patches requires explicit `fixMode: 'apply'` in the input.
 */

import { join, resolve } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

import { runAnalysis as coreRunAnalysis, detectProject } from '@turpan/core';
import type { Category, Finding as CoreFinding, Severity } from '@turpan/core';
import { runAgentOutputAudit } from '@turpan/analyzers';
import { runUiTest } from '@turpan/ui-runner';
import type { FixMode } from '@turpan/fix-engine';
import { loadLatestRunArtifacts, summarizeFindingSeverities } from '@turpan/report';
import type { Finding } from '@turpan/shared';

import { validateProjectPath, validateTaskFilePath, validateRunId, getLatestRunPath } from '../security/workspace.js';
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

const CORE_CATEGORIES = new Set<Category>([
  'project', 'build', 'test', 'lint', 'typecheck', 'security', 'ui', 'accessibility',
  'performance', 'architecture', 'dead-code', 'dependency', 'agent-output',
  'maintainability', 'runtime', 'api-design', 'error-boundary', 'config', 'unknown-project',
]);
const CORE_SEVERITIES = new Set<Severity>(['critical', 'high', 'medium', 'low', 'info']);

function isCoreFinding(finding: Finding): finding is CoreFinding {
  return CORE_CATEGORIES.has(finding.category as Category) &&
    CORE_SEVERITIES.has(finding.severity as Severity) &&
    Array.isArray(finding.evidence) && finding.evidence.length > 0 &&
    ['auto', 'manual', 'none'].includes(finding.fixable) &&
    typeof finding.confidence === 'number' && Array.isArray(finding.tags);
}

function deriveArtifactVerdict(findings: Finding[]): 'GO' | 'CONDITIONAL_GO' | 'NO_GO' {
  if (findings.some(finding => finding.severity === 'critical')) return 'NO_GO';
  if (findings.some(finding => finding.severity === 'high')) return 'CONDITIONAL_GO';
  return 'GO';
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
    await coreRunAnalysis({
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
    const verdict = deriveArtifactVerdict(findings);
    const summary = summarizeFindingSeverities(findings);

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
    findingsSummary: `${findings.length} findings (${summarizeFindingSeverities(findings)})`,
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
    fingerprint,
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
  const { buildFixPlan: buildPlan, applyFixCandidates: applyFix, generatePatch, verifyPatch } = await import('@turpan/fix-engine');
  const coreFindings = targetFindings.filter(isCoreFinding);
  if (coreFindings.length === 0) {
    return { patchPath: '', applied: 0, validationSummary: 'No evidence-backed findings eligible for fixing' };
  }

  const plan = buildPlan({ findings: coreFindings, projectRoot, fixMode });
  const patch = generatePatch(plan.applied);
  const result = await applyFix(plan.applied, {
    projectRoot,
    runId: plan.runId,
    useWorktree: fixMode === 'apply',
    dryRun: fixMode === 'patch-only',
    backup: fixMode === 'apply',
  });
  const validation = result.success && fixMode === 'apply'
    ? await verifyPatch(plan.applied, { projectRoot, checks: plan.requiredChecks, timeoutMs: 120_000 })
    : { allPassed: result.success, results: [], totalDurationMs: 0 };

  return {
    patchPath: patch.patchContent ? join(projectRoot, '.turpan', 'runs', runId, 'TURPAN_PATCH.diff') : '',
    applied: result.modified.length,
    validationSummary: validation.allPassed
      ? `All ${validation.results.length} validation checks passed`
      : `${validation.results.filter(check => !check.passed).length}/${validation.results.length} checks failed`,
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
