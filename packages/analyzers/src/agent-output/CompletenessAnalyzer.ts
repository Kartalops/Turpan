/**
 * CompletenessAnalyzer — orchestrates all agent-output analyzers and computes completion score
 */

import { readFileSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';
import type {
  ParsedTask,
  Capability,
  CapabilityCategory,
  CompletionScore,
  AgentOutputAuditReport,
  AgentOutputIssue,
  ImplementationMap,
} from './types.js';
import { parseTaskText, loadTaskFile, loadDefaultTask } from './TaskParser.js';
import { mapImplementation } from './ImplementationMapper.js';
import { analyzeFakeImplementations } from './FakeImplementationAnalyzer.js';
import { analyzeReadmeMismatch } from './ReadmeMismatchAnalyzer.js';
import { analyzeNoopTests, findTestFiles } from './NoopTestAnalyzer.js';
import { analyzeUnwiredFeatures } from './UnwiredFeatureAnalyzer.js';

// ── Score Weights ─────────────────────────────────────────────────────────────

const COVERAGE_WEIGHT = 0.30;
const DEPTH_WEIGHT = 0.25;
const TEST_WEIGHT = 0.20;
const RUNTIME_WEIGHT = 0.15;
const UI_WEIGHT = 0.10;

// ── Public API ────────────────────────────────────────────────────────────────

export interface AgentAuditOptions {
  projectRoot: string;
  taskText?: string;        // inline task text
  taskFile?: string;        // path to task file
  useDefaultTask?: boolean; // try .turpan/task.md
  agentType?: string;       // override agent type
  /** When true, implementation mapping is scoped to changed files from a git diff */
  diffMode?: boolean;
  /** Git diff result — required when diffMode is true */
  diffResult?: {
    files: Array<{
      path: string;
      changeType: 'added' | 'modified' | 'deleted' | 'renamed';
      oldPath?: string;
    }>;
  };
}

export async function runAgentOutputAudit(opts: AgentAuditOptions): Promise<AgentOutputAuditReport> {
  const { projectRoot, taskText, taskFile, useDefaultTask = true } = opts;

  // 1. Parse task
  let task: ParsedTask;
  if (taskText) {
    task = parseTaskText(taskText, 'shell');
  } else if (taskFile) {
    task = loadTaskFile(taskFile);
  } else if (useDefaultTask) {
    const defaultTask = loadDefaultTask(projectRoot);
    if (defaultTask) {
      task = defaultTask;
    } else {
      task = parseTaskText('(No task file found — generic review)', 'shell');
    }
  } else {
    task = parseTaskText('(No task provided — generic review)', 'shell');
  }

  // 2. Map implementation
  const implementation = mapImplementation(projectRoot, task, { diffMode: opts.diffMode, diffResult: opts.diffResult });

  // 3. Gather files for analysis
  const sourceFiles = opts.diffMode && opts.diffResult
    ? opts.diffResult.files.filter(f => f.changeType !== 'deleted').map(f => f.path)
    : gatherSourceFiles(projectRoot);
  const testFiles = opts.diffMode && opts.diffResult
    ? opts.diffResult.files
        .filter(f => f.changeType !== 'deleted' && (f.path.includes('test') || f.path.includes('spec')))
        .map(f => f.path)
    : findTestFiles(projectRoot);
  const capabilityCategories = task.capabilities.map(c => c.category);

  // 4. Run all analyzers in parallel
  const [fakeIssues, readmeIssues, noopIssues, unwiredIssues] = await Promise.all([
    Promise.resolve(analyzeFakeImplementations({ projectRoot, files: sourceFiles, taskCapabilities: capabilityCategories })),
    Promise.resolve(analyzeReadmeMismatch({ projectRoot, taskCapabilities: capabilityCategories })),
    Promise.resolve(analyzeNoopTests({ projectRoot, testFiles })),
    Promise.resolve(analyzeUnwiredFeatures({ projectRoot, taskCapabilities: capabilityCategories })),
  ]);

  const allIssues = [...fakeIssues, ...readmeIssues, ...noopIssues, ...unwiredIssues];

  // 5. Add missing capability detection
  const missingIssues = detectMissingCapabilities(task, implementation);
  allIssues.push(...missingIssues);

  // 6. Compute completion score
  const completion = computeCompletionScore(
    task.capabilities,
    implementation,
    allIssues,
    testFiles.length,
    sourceFiles.length,
  );

  // 7. Build evidence files list
  const evidenceFiles = [...new Set(
    allIssues.flatMap(i => i.evidence.filter(e => e.path).map(e => e.path!))
  )];

  // 8. Determine recommendation
  const recommendation = computeRecommendation(completion, allIssues);

  // 9. Compute confidence level
  const confidenceLevel = computeConfidenceLevel(completion, allIssues);

  // 10. Build summary
  const summary = buildSummary(task, completion, allIssues);

  return {
    task,
    completion,
    issues: allIssues,
    implementation,
    requestedCapabilities: task.capabilities,
    implementedCapabilities: implementation.items.map(i => ({ category: i.capability ?? 'other', name: i.file })),
    confidenceLevel,
    summary,
    evidenceFiles,
    recommendation,
  };
}

// ── Missing Capability Detection ─────────────────────────────────────────────

function detectMissingCapabilities(
  task: ParsedTask,
  implementation: ImplementationMap
): AgentOutputIssue[] {
  const issues: AgentOutputIssue[] = [];
  const implCapabilities = new Set(implementation.items.map(i => i.capability));

  for (const cap of task.capabilities) {
    if (!implCapabilities.has(cap.category)) {
      const severity = severityForCategory(cap.category);
      issues.push({
        kind: 'missing-capability',
        severity,
        title: `Requested capability not found: ${cap.category}`,
        explanation: `The task requested "${cap.name}" (${cap.category}), but no corresponding implementation was detected in the project. Either the feature was not built or it uses non-standard naming that could not be detected.`,
        capability: cap,
        suggestedFix: `Implement the ${cap.category} feature or verify the existing implementation uses a naming convention that could be detected by static analysis.`,
        confidence: 75,
        evidence: cap.evidence
          ? [{ type: 'text', excerpt: cap.evidence }]
          : [{ type: 'text', excerpt: cap.name }],
      });
    }
  }

  return issues;
}

function severityForCategory(category: CapabilityCategory): 'critical' | 'high' | 'medium' | 'low' {
  const critical: CapabilityCategory[] = ['auth', 'billing', 'security'];
  const high: CapabilityCategory[] = ['database', 'backend-endpoints', 'api-design', 'tests'];
  const medium: CapabilityCategory[] = ['ui-pages', 'dashboard', 'workers', 'mcp-server', 'cli', 'integrations'];

  if (critical.includes(category)) return 'critical';
  if (high.includes(category)) return 'high';
  if (medium.includes(category)) return 'medium';
  return 'low';
}

// ── Completion Score ─────────────────────────────────────────────────────────

function computeCompletionScore(
  capabilities: Capability[],
  implementation: ImplementationMap,
  issues: AgentOutputIssue[],
  testCount: number,
  sourceCount: number,
): CompletionScore {
  const total = capabilities.length;
  const implSet = new Set(implementation.items.map(i => i.capability));
  const implementedCapabilities = capabilities.filter(c => implSet.has(c.category)).length;
  const missingCapabilities = capabilities.filter(c => !implSet.has(c.category));

  // Coverage: % of requested capabilities that have some implementation
  const requestedFeatureCoverage = total > 0 ? Math.round((implementedCapabilities / total) * 100) : 0;

  // Depth: how thorough is the implementation (based on file diversity)
  const uniqueTypes = new Set(implementation.items.map(i => i.type));
  const implDepth = Math.min(100, Math.round((uniqueTypes.size / 8) * 100));

  // Test coverage relevance: do tests exist and are they meaningful?
  const testCoverageRelevance = computeTestRelevance(testCount, issues);

  // Runtime validation: crude estimate based on issues
  const runtimeValidation = computeRuntimeValidation(issues);

  // UI validation: based on UI-related implementation
  const hasUIImpl = implementation.items.some(i => i.type === 'route' || i.type === 'component');
  const uiValidation = hasUIImpl ? 70 : 30;

  const capabilityScores: Record<string, number> = {};
  for (const cap of capabilities) {
    const capItems = implementation.items.filter(i => i.capability === cap.category);
    const hasFake = issues.some(i => i.capability?.category === cap.category && i.kind === 'fake-implementation');
    const hasMissing = missingCapabilities.some(c => c.category === cap.category);
    if (hasMissing) {
      capabilityScores[cap.category] = 0;
    } else if (hasFake) {
      capabilityScores[cap.category] = 30;
    } else {
      capabilityScores[cap.category] = Math.min(100, Math.round((capItems.length / 2) * 100 + 50));
    }
  }

  const overall = Math.round(
    requestedFeatureCoverage * COVERAGE_WEIGHT +
    implDepth * DEPTH_WEIGHT +
    testCoverageRelevance * TEST_WEIGHT +
    runtimeValidation * RUNTIME_WEIGHT +
    uiValidation * UI_WEIGHT
  );

  const fakeOrShallow = issues
    .filter(i => i.kind === 'fake-implementation' || i.kind === 'shallow-completion')
    .map(i => i.capability)
    .filter((c): c is Capability => c !== undefined);

  return {
    overall: Math.max(0, Math.min(100, overall)),
    requestedFeatureCoverage,
    implementationDepth: implDepth,
    testCoverageRelevance,
    runtimeValidation,
    uiValidation,
    capabilityScores,
    totalCapabilities: total,
    implementedCapabilities,
    missingCapabilities,
    fakeOrShallowCapabilities: fakeOrShallow,
  };
}

function computeTestRelevance(testCount: number, issues: AgentOutputIssue[]): number {
  if (testCount === 0) return 0;

  const noopCount = issues.filter(i => i.kind === 'noop-test').length;
  const meaningfulRatio = Math.max(0, 1 - noopCount / Math.max(testCount, 1));

  return Math.min(100, Math.round(meaningfulRatio * 70 + (testCount > 3 ? 30 : testCount * 10)));
}

function computeRuntimeValidation(issues: AgentOutputIssue[]): number {
  const criticalFakes = issues.filter(
    i => i.kind === 'fake-implementation' && (i.severity === 'critical' || i.severity === 'high')
  ).length;

  return Math.max(0, Math.min(100, 100 - criticalFakes * 20));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeRecommendation(completion: CompletionScore, issues: AgentOutputIssue[]): AgentOutputAuditReport['recommendation'] {
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const highCount = issues.filter(i => i.severity === 'high').length;
  const missingCritical = completion.missingCapabilities.some(c =>
    ['auth', 'billing', 'security', 'database'].includes(c.category)
  );

  if (criticalCount > 0 || missingCritical) return 'MAJOR_REWORK';
  if (highCount > 2 || completion.overall < 50) return 'NOT_READY';
  if (highCount > 0 || completion.overall < 75) return 'READY_WITH_LIMITATIONS';
  return 'READY';
}

function computeConfidenceLevel(completion: CompletionScore, issues: AgentOutputIssue[]): 'high' | 'medium' | 'low' {
  const highIssues = issues.filter(i => i.confidence >= 80).length;
  const lowIssues = issues.filter(i => i.confidence < 60).length;

  if (highIssues > lowIssues && completion.overall > 50) return 'high';
  if (lowIssues > highIssues || completion.overall < 30) return 'low';
  return 'medium';
}

function buildSummary(task: ParsedTask, completion: CompletionScore, issues: AgentOutputIssue[]): string {
  const capCount = task.capabilities.length;
  const implCount = completion.implementedCapabilities;
  const missingCount = completion.missingCapabilities.length;
  const fakeCount = issues.filter(i => i.kind === 'fake-implementation').length;
  const noopCount = issues.filter(i => i.kind === 'noop-test').length;

  const parts: string[] = [];
  parts.push(`${implCount}/${capCount} requested capabilities have implementation.`);
  if (missingCount > 0) parts.push(`${missingCount} capabilities are missing.`);
  if (fakeCount > 0) parts.push(`${fakeCount} fake/shallow implementations detected.`);
  if (noopCount > 0) parts.push(`${noopCount} no-op tests found.`);

  return parts.join(' ') || 'No significant issues detected.';
}

function gatherSourceFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const textExts = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'py', 'go', 'rs', 'java', 'sh', 'json']);

  function walk(dir: string, depth = 0): void {
    if (depth > 5) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.next' || entry.name === 'coverage' || entry.name === '.turpan') continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
          if (textExts.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // skip
    }
  }

  walk(projectRoot);
  return files;
}

// ── LLMJudge Interface (optional, heuristic mode is default) ─────────────────

export interface LLMJudgeConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMJudge {
  judge(reports: AgentOutputAuditReport): Promise<AgentOutputAuditReport>;
}
