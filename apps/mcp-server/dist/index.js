var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/index.ts
import { Command } from "commander";
import chalk from "chalk";
import { resolve as resolve3, join as join5 } from "path";
import { readFileSync as readFileSync5, existsSync as existsSync6 } from "fs";

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
  LoggingMessageNotificationSchema
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";

// src/tools/review.ts
import { join as join2 } from "path";
import { existsSync as existsSync2, readFileSync } from "fs";
import { runAnalysis as coreRunAnalysis, detectProject } from "@turpan/core";
import { runAgentOutputAudit } from "@turpan/analyzers";
import { runUiTest } from "@turpan/ui-runner";
import { loadLatestRunArtifacts, summarizeFindingSeverities } from "@turpan/report";

// src/security/workspace.ts
import { resolve, isAbsolute, join, normalize } from "path";
import { existsSync } from "fs";
var DEFAULT_ALLOWLIST = {
  roots: [],
  requireExists: true
};
var currentAllowlist = { ...DEFAULT_ALLOWLIST };
function setWorkspaceAllowlist(roots) {
  currentAllowlist = {
    roots: roots.map((r) => resolve(r)),
    requireExists: true
  };
}
function getWorkspaceAllowlist() {
  return [...currentAllowlist.roots];
}
function findWorkspaceRoot(targetPath) {
  const abs = isAbsolute(targetPath) ? targetPath : resolve(process.cwd(), targetPath);
  const normalized = normalize(abs);
  for (const root of currentAllowlist.roots) {
    const normalizedRoot = normalize(root);
    if (normalized === normalizedRoot || normalized.startsWith(normalizedRoot + "/") || normalized.startsWith(normalizedRoot + "\\")) {
      return normalizedRoot;
    }
  }
  if (currentAllowlist.roots.length === 0) {
    return null;
  }
  return null;
}
function validateProjectPath(inputPath) {
  const abs = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
  const normalized = normalize(abs);
  const normalizedForward = normalized.replace(/\\/g, "/");
  if (normalizedForward.includes("..")) {
    throw new PathTraversalError(`Path traversal detected: ${inputPath}`);
  }
  if (currentAllowlist.requireExists && !existsSync(normalized)) {
    throw new InvalidPathError(`Project path does not exist: ${inputPath}`);
  }
  if (currentAllowlist.roots.length > 0) {
    const wsRoot = findWorkspaceRoot(normalized);
    if (!wsRoot) {
      throw new WorkspaceViolationError(
        `Project path "${inputPath}" is not within any allowed workspace. Allowed roots: ${currentAllowlist.roots.join(", ")}`
      );
    }
    return {
      original: inputPath,
      resolved: normalized,
      workspaceRoot: wsRoot,
      isWithinWorkspace: true
    };
  }
  return {
    original: inputPath,
    resolved: normalized,
    workspaceRoot: "",
    isWithinWorkspace: true
  };
}
function validateTaskFilePath(taskPath, projectPath) {
  const abs = isAbsolute(taskPath) ? taskPath : resolve(projectPath, taskPath);
  const normalized = normalize(abs);
  const projNormalized = normalize(projectPath);
  if (!normalized.startsWith(projNormalized + "/") && !normalized.startsWith(projNormalized + "\\")) {
    throw new PathTraversalError(
      `Task file "${taskPath}" is outside project directory`
    );
  }
  return {
    original: taskPath,
    resolved: normalized,
    workspaceRoot: "",
    isWithinWorkspace: true
  };
}
function validateRunId(runId) {
  if (!/^[a-zA-Z0-9_:-]+$/.test(runId)) {
    throw new InvalidPathError(`Invalid runId format: ${runId}`);
  }
  if (runId.length > 128) {
    throw new InvalidPathError(`runId too long: ${runId.length} > 128`);
  }
}
function getLatestRunPath(projectPath) {
  const { join: join6 } = __require("path");
  const { existsSync: existsSync7, readlinkSync } = __require("fs");
  const latest = join6(projectPath, ".turpan", "runs", "latest");
  if (!existsSync7(latest)) return null;
  try {
    return readlinkSync(latest);
  } catch {
    return latest;
  }
}
var PathTraversalError = class extends Error {
  code = "PATH_TRAVERSAL";
  constructor(message) {
    super(message);
    this.name = "PathTraversalError";
  }
};
var WorkspaceViolationError = class extends Error {
  code = "WORKSPACE_VIOLATION";
  constructor(message) {
    super(message);
    this.name = "WorkspaceViolationError";
  }
};
var InvalidPathError = class extends Error {
  code = "INVALID_PATH";
  constructor(message) {
    super(message);
    this.name = "InvalidPathError";
  }
};

// src/security/redact.ts
var SECRET_PATTERNS = [
  // AWS access key (AKIA + 16 chars)
  [/\bAKIA[0-9A-Z]{16}\b/g, "AKIA***[REDACTED]"],
  // GitHub token (ghp_ / gho_ / ghs_ / ghr_ prefix)
  [/\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g, "gh***[REDACTED]"],
  // Bearer tokens in headers/logs
  [/\bbearer\s+[A-Za-z0-9_.-]{20,}/gi, "bearer [REDACTED]"],
  // Password in URL (proto://user:pass@host)
  [/\/\/[^\s:]+:[^\s@]+@[^\s,]+/g, "//[USER]:[REDACTED]@[HOST]"],
  // Private key PEM markers
  [/-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----/g, "[PRIVATE KEY REDACTED]"],
  // Long alphanumeric strings that look like API keys (30+ chars)
  [/[A-Za-z0-9/+=]{30,}/g, "[SECRET]"]
];
var SENSITIVE_ENV_VARS = /* @__PURE__ */ new Set([
  "API_KEY",
  "APIKEY",
  "AUTH_TOKEN",
  "ACCESS_TOKEN",
  "SECRET",
  "SECRET_KEY",
  "PRIVATE_KEY",
  "PASSWORD",
  "PASS",
  "TOKEN",
  "API_TOKEN",
  "GITHUB_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DATABASE_URL",
  "DATABASE_PASSWORD",
  "DB_PASSWORD",
  "DB_PASS",
  "DB_USER",
  "DB_NAME",
  "DB_HOST",
  "DB_PORT",
  "DB_URL",
  "REDIS_URL",
  "REDIS_PASSWORD",
  "SENTRY_DSN",
  "STRIPE_KEY",
  "STRIPE_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_KEY",
  "ANTHROPIC_KEY",
  "SECRET_KEY",
  "JWT_SECRET",
  "SESSION_SECRET"
]);
function redactSecrets(input) {
  if (!input || typeof input !== "string") return input ?? "";
  let result = input;
  for (const [pattern, label] of SECRET_PATTERNS) {
    result = result.replace(pattern, label);
  }
  result = result.replace(
    new RegExp(
      `^(${Array.from(SENSITIVE_ENV_VARS).join("|")})=(.+)$`,
      "gim"
    ),
    "$1=[REDACTED]"
  );
  return result;
}
function redactObject(obj, depth = 0) {
  if (depth > 10) return obj;
  if (obj === null || obj === void 0) return obj;
  if (typeof obj === "string") return redactSecrets(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_ENV_VARS.has(key.toUpperCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(value, depth + 1);
      }
    }
    return result;
  }
  return obj;
}
function redactError(error) {
  if (error instanceof Error) {
    return redactSecrets(error.message);
  }
  if (typeof error === "string") {
    return redactSecrets(error);
  }
  return redactSecrets(String(error));
}
function formatSafeError(error, includeStack = false) {
  if (error instanceof PathTraversalError || error instanceof WorkspaceViolationError || error instanceof InvalidPathError) {
    return {
      message: error.message,
      code: error.code
    };
  }
  const message = redactError(error);
  const safe = {
    message: message.includes("ENOENT") ? "File not found" : message.includes("permission") ? "Permission denied" : message.includes("timeout") ? "Operation timed out" : message.includes("ENOENT") || message.includes("not exist") ? "Path not found" : message,
    code: "INTERNAL_ERROR"
  };
  if (includeStack) {
    safe.stack = redactSecrets(new Error().stack ?? "").split("\n").slice(0, 5).join("\n");
  }
  return safe;
}

// src/tools/review.ts
import { createTimestampDir } from "@turpan/shared";
async function ensureRunDir(projectPath) {
  const baseRunPath = join2(projectPath, ".turpan", "runs");
  return createTimestampDir(baseRunPath);
}
var CORE_CATEGORIES = /* @__PURE__ */ new Set([
  "project",
  "build",
  "test",
  "lint",
  "typecheck",
  "security",
  "ui",
  "accessibility",
  "performance",
  "architecture",
  "dead-code",
  "dependency",
  "agent-output",
  "maintainability",
  "runtime",
  "api-design",
  "error-boundary",
  "config",
  "unknown-project"
]);
var CORE_SEVERITIES = /* @__PURE__ */ new Set(["critical", "high", "medium", "low", "info"]);
function isCoreFinding(finding) {
  return CORE_CATEGORIES.has(finding.category) && CORE_SEVERITIES.has(finding.severity) && Array.isArray(finding.evidence) && finding.evidence.length > 0 && ["auto", "manual", "none"].includes(finding.fixable) && typeof finding.confidence === "number" && Array.isArray(finding.tags);
}
function deriveArtifactVerdict(findings) {
  if (findings.some((finding) => finding.severity === "critical")) return "NO_GO";
  if (findings.some((finding) => finding.severity === "high")) return "CONDITIONAL_GO";
  return "GO";
}
async function reviewProject(input, emitLog) {
  const { projectPath, mode, includeUi, includeRuntime, includeSecurity, includeAgentAudit, taskFile, fixMode } = input;
  let validated;
  try {
    validated = validateProjectPath(projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }
  const projectRoot = validated.resolved;
  const runPath = await ensureRunDir(projectRoot);
  const runId = runPath.split("/").pop() ?? (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  emitLog?.(`[turpan.review_project] Starting ${mode} review on ${projectRoot}`);
  try {
    const timeoutMs = mode === "deep" ? 3e5 : 12e4;
    await coreRunAnalysis({
      projectPath: projectRoot,
      deepAnalysis: mode === "deep",
      uiAnalysis: includeUi,
      fixMode: fixMode === "patch-only",
      install: false,
      timeoutMs,
      skipBuild: false,
      skipTests: false,
      skipLint: false,
      skipTypecheck: false,
      skipSecurity: !includeSecurity,
      skipUi: !includeUi,
      skipRuntime: !includeRuntime
    });
    if (includeAgentAudit && taskFile) {
      try {
        validateTaskFilePath(taskFile, projectRoot);
      } catch (e) {
        emitLog?.(`[turpan.review_project] Task file validation failed: ${formatSafeError(e).message}`);
      }
    }
    const { findings, scorecard } = loadLatestRunArtifacts(projectRoot);
    const verdict = deriveArtifactVerdict(findings);
    const summary = summarizeFindingSeverities(findings);
    return {
      runId,
      verdict,
      score: scorecard.overall,
      findingsSummary: `${findings.length} findings (${summary})`,
      reportPath: join2(runPath, "TURPAN_ANALYSIS.md")
    };
  } catch (err) {
    const safe = formatSafeError(err);
    throw new Error(`Review failed: ${safe.message}`);
  }
}
async function reviewDiff(input, emitLog) {
  let validated;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }
  const projectRoot = validated.resolved;
  const runPath = await ensureRunDir(projectRoot);
  const runId = runPath.split("/").pop() ?? (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  emitLog?.(`[turpan.review_diff] Comparing ${input.baseRef}..${input.targetRef}`);
  await coreRunAnalysis({
    projectPath: projectRoot,
    deepAnalysis: false,
    uiAnalysis: input.includeUi,
    fixMode: false,
    install: false,
    timeoutMs: 12e4
  });
  const { findings } = loadLatestRunArtifacts(projectRoot);
  return {
    runId,
    reportPath: join2(runPath, "TURPAN_ANALYSIS.md"),
    findingsSummary: `${findings.length} findings (${summarizeFindingSeverities(findings)})`
  };
}
async function liveUiTest(input, emitLog) {
  let validated;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }
  const projectRoot = validated.resolved;
  const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  emitLog?.(`[turpan.live_ui_test] Starting UI test on ${projectRoot}`);
  const fingerprint = detectProject(projectRoot);
  const report = await runUiTest({
    projectRoot,
    runId,
    fingerprint,
    url: input.url,
    headed: input.headed,
    mobileOnly: input.mobile,
    trace: input.trace
  });
  const screenshots = report.artifacts.screenshots.map((s) => s.path);
  return {
    runId,
    uiSummary: `${report.summary.successfulRoutes}/${report.summary.totalRoutes} routes, ${report.summary.consoleErrors} console errors, verdict: ${report.verdict}`,
    screenshots,
    findings: report.findings.map((f) => ({ title: f.title, severity: f.severity, category: f.category }))
  };
}
async function agentOutputAudit(input, emitLog) {
  let validated;
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
  const taskText = readFileSync(input.taskFile, "utf-8");
  emitLog?.(`[turpan.agent_output_audit] Running agent audit on ${projectRoot}`);
  const report = await runAgentOutputAudit({
    projectRoot,
    taskText,
    agentType: input.agentName
  });
  const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const runDir = join2(projectRoot, ".turpan", "runs", runId);
  return {
    completionScore: report.completion.overall,
    missingCapabilities: report.completion.missingCapabilities.map((c) => c.category),
    fakeImplementationFindings: report.completion.fakeOrShallowCapabilities.map((c) => c.category),
    reportPath: join2(runDir, "AGENT_OUTPUT_AUDIT.json")
  };
}
async function fixFindings(input, emitLog) {
  let validated;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }
  const projectRoot = validated.resolved;
  const fixMode = input.fixMode ?? "patch-only";
  if (fixMode !== "patch-only" && fixMode !== "apply") {
    throw formatSafeError(new Error('fixMode must be "patch-only" or "apply"'));
  }
  emitLog?.(`[turpan.fix_findings] Running fix engine in ${fixMode} mode`);
  const { findings } = loadLatestRunArtifacts(projectRoot);
  if (findings.length === 0) {
    return { patchPath: "", applied: 0, validationSummary: "No findings to fix" };
  }
  const targetFindings = input.findingIds ? findings.filter((f) => input.findingIds.includes(f.id)) : findings;
  if (targetFindings.length === 0) {
    return { patchPath: "", applied: 0, validationSummary: "No matching findings to fix" };
  }
  const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const { buildFixPlan: buildPlan, applyFixCandidates: applyFix, generatePatch, verifyPatch } = await import("@turpan/fix-engine");
  const coreFindings = targetFindings.filter(isCoreFinding);
  if (coreFindings.length === 0) {
    return { patchPath: "", applied: 0, validationSummary: "No evidence-backed findings eligible for fixing" };
  }
  const plan = buildPlan({ findings: coreFindings, projectRoot, fixMode });
  const patch = generatePatch(plan.applied);
  const result = await applyFix(plan.applied, {
    projectRoot,
    runId: plan.runId,
    useWorktree: fixMode === "apply",
    dryRun: fixMode === "patch-only",
    backup: fixMode === "apply"
  });
  const validation = result.success && fixMode === "apply" ? await verifyPatch(plan.applied, { projectRoot, checks: plan.requiredChecks, timeoutMs: 12e4 }) : { allPassed: result.success, results: [], totalDurationMs: 0 };
  return {
    patchPath: patch.patchContent ? join2(projectRoot, ".turpan", "runs", runId, "TURPAN_PATCH.diff") : "",
    applied: result.modified.length,
    validationSummary: validation.allPassed ? `All ${validation.results.length} validation checks passed` : `${validation.results.filter((check) => !check.passed).length}/${validation.results.length} checks failed`
  };
}
async function getReport(input, emitLog) {
  let validated;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }
  const projectRoot = validated.resolved;
  const { runId, format } = input;
  let runPath;
  if (runId) {
    try {
      validateRunId(runId);
    } catch (e) {
      throw formatSafeError(e);
    }
    runPath = join2(projectRoot, ".turpan", "runs", runId);
  } else {
    const latest = getLatestRunPath(projectRoot);
    if (!latest) throw new Error("No run found. Run turpan.review_project first.");
    runPath = latest;
  }
  emitLog?.(`[turpan.get_report] Loading ${format} report from ${runPath}`);
  const filename = format === "html" ? "TURPAN_ANALYSIS.html" : format === "json" ? "TURPAN_FINDINGS.json" : "TURPAN_ANALYSIS.md";
  const filePath = join2(runPath, filename);
  if (!existsSync2(filePath)) {
    throw new Error(`Report file not found: ${filename}`);
  }
  return {
    content: readFileSync(filePath, "utf-8"),
    format
  };
}
async function getFindings(input, emitLog) {
  let validated;
  try {
    validated = validateProjectPath(input.projectPath);
  } catch (e) {
    throw formatSafeError(e);
  }
  const projectRoot = validated.resolved;
  const { runId, severity, category } = input;
  let runPath;
  if (runId) {
    try {
      validateRunId(runId);
    } catch (e) {
      throw formatSafeError(e);
    }
    runPath = join2(projectRoot, ".turpan", "runs", runId);
  } else {
    const latest = getLatestRunPath(projectRoot);
    if (!latest) return { findings: [], total: 0 };
    runPath = latest;
  }
  const findingsPath = join2(runPath, "TURPAN_FINDINGS.json");
  if (!existsSync2(findingsPath)) {
    return { findings: [], total: 0 };
  }
  let allFindings = [];
  try {
    allFindings = JSON.parse(readFileSync(findingsPath, "utf-8")).findings ?? [];
  } catch {
    return { findings: [], total: 0 };
  }
  let filtered = allFindings;
  if (severity) filtered = filtered.filter((f) => f.severity === severity);
  if (category) filtered = filtered.filter((f) => f.category === category);
  const redacted = redactObject(filtered);
  emitLog?.(`[turpan.get_findings] Returning ${redacted.length}/${allFindings.length} findings`);
  return { findings: redacted, total: redacted.length };
}

// src/resources/handler.ts
import { readFileSync as readFileSync2, readdirSync as readdirSync2, existsSync as existsSync3 } from "fs";
import { join as join3 } from "path";

// src/schemas/resources.ts
function parseTurpanUri(uri) {
  const match = uri.match(/^turpan:\/\/runs\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { runId: match[1], filename: match[2] };
}
function buildTurpanUri(runId, filename) {
  return `turpan://runs/${runId}/${filename}`;
}
var ALLOWED_RESOURCES = {
  "TURPAN_ANALYSIS.md": { mimeType: "text/markdown", description: "Human-readable analysis report" },
  "TURPAN_FINDINGS.json": { mimeType: "application/json", description: "Structured findings list" },
  "TURPAN_SCORECARD.json": { mimeType: "application/json", description: "Quality scorecard" },
  "TURPAN_PATCH.diff": { mimeType: "text/plain", description: "Unified diff for all auto-safe fixes" },
  "screenshots": { mimeType: "application/octet-stream", description: "UI test screenshots directory" },
  "logs": { mimeType: "application/octet-stream", description: "Run logs directory" },
  "TURPAN_RUN_SUMMARY.json": { mimeType: "application/json", description: "Run metadata summary" },
  "project-fingerprint.json": { mimeType: "application/json", description: "Project fingerprint data" }
};
function isAllowedResource(filename) {
  return filename in ALLOWED_RESOURCES;
}

// src/resources/handler.ts
function listTurpanResources(projectPath, runId) {
  const resources = [];
  try {
    validateProjectPath(projectPath);
  } catch {
    return resources;
  }
  let targetRunId;
  if (runId) {
    try {
      validateRunId(runId);
    } catch {
      return resources;
    }
    targetRunId = runId;
  } else {
    const latest = getLatestRunPath(projectPath);
    if (!latest) return resources;
    targetRunId = latest.split("/").pop() ?? "latest";
  }
  const runDir = join3(projectPath, ".turpan", "runs", targetRunId);
  for (const [filename, info] of Object.entries(ALLOWED_RESOURCES)) {
    const filePath = join3(runDir, filename);
    if (existsSync3(filePath)) {
      resources.push({
        uri: buildTurpanUri(targetRunId, filename),
        name: `${filename} (${targetRunId})`,
        description: info.description,
        mimeType: info.mimeType
      });
    }
  }
  return resources;
}
function readTurpanResource(projectPath, uri) {
  const parsed = parseTurpanUri(uri);
  if (!parsed) return null;
  try {
    validateProjectPath(projectPath);
  } catch {
    return null;
  }
  if (!isAllowedResource(parsed.filename)) return null;
  let targetRunId = parsed.runId;
  if (targetRunId === "latest") {
    const latest = getLatestRunPath(projectPath);
    if (!latest) return null;
    targetRunId = latest.split("/").pop() ?? "latest";
  } else {
    try {
      validateRunId(targetRunId);
    } catch {
      return null;
    }
  }
  const filePath = join3(projectPath, ".turpan", "runs", targetRunId, parsed.filename);
  if (!existsSync3(filePath)) return null;
  if (parsed.filename === "screenshots" || parsed.filename === "logs") {
    try {
      const files = readdirSync2(filePath);
      return {
        content: JSON.stringify({ files, count: files.length }, null, 2),
        mimeType: "application/json"
      };
    } catch {
      return null;
    }
  }
  const content = readFileSync2(filePath, "utf-8");
  const info = ALLOWED_RESOURCES[parsed.filename];
  if (parsed.filename.endsWith(".json")) {
    try {
      const redacted = redactObject(JSON.parse(content));
      return { content: JSON.stringify(redacted, null, 2), mimeType: info.mimeType };
    } catch {
      return { content, mimeType: info.mimeType };
    }
  }
  return { content, mimeType: info.mimeType };
}

// src/schemas/tools.ts
import { z } from "zod";
var projectPathSchema = z.string().min(1).max(4096);
var runIdSchema = z.string().regex(/^[a-zA-Z0-9_:-]+$/, "runId must be alphanumeric with underscores, colons, or hyphens").max(128);
var severitySchema = z.enum(["critical", "high", "medium", "low", "info"]).optional();
var categorySchema = z.string().max(128).optional();
var formatSchema = z.enum(["markdown", "html", "json"]).default("markdown");
var fixModeSchema = z.enum(["patch-only", "apply"]).default("patch-only");
var reviewProjectInputSchema = z.object({
  projectPath: projectPathSchema,
  mode: z.enum(["quick", "deep"]).default("quick"),
  includeUi: z.boolean().default(false),
  includeRuntime: z.boolean().default(false),
  includeSecurity: z.boolean().default(true),
  includeAgentAudit: z.boolean().default(false),
  taskFile: z.string().max(4096).optional(),
  fixMode: fixModeSchema.optional().default("patch-only")
});
var reviewDiffInputSchema = z.object({
  projectPath: projectPathSchema,
  baseRef: z.string().min(1).max(256),
  targetRef: z.string().min(1).max(256),
  includeUi: z.boolean().default(false),
  taskFile: z.string().max(4096).optional()
});
var liveUiTestInputSchema = z.object({
  projectPath: projectPathSchema,
  url: z.string().url().optional(),
  headed: z.boolean().default(false),
  mobile: z.boolean().default(false),
  trace: z.boolean().default(false)
});
var agentOutputAuditInputSchema = z.object({
  projectPath: projectPathSchema,
  taskFile: projectPathSchema,
  agentName: z.string().max(64).optional()
});
var fixFindingsInputSchema = z.object({
  projectPath: projectPathSchema,
  runId: runIdSchema.optional(),
  findingIds: z.array(z.string().max(64)).max(100).optional(),
  fixMode: fixModeSchema
});
var getReportInputSchema = z.object({
  projectPath: projectPathSchema,
  runId: runIdSchema.optional(),
  format: formatSchema.default("markdown")
});
var getFindingsInputSchema = z.object({
  projectPath: projectPathSchema,
  runId: runIdSchema.optional(),
  severity: severitySchema,
  category: categorySchema
});

// src/server.ts
var DEFAULT_SERVER_NAME = "turpan";
var DEFAULT_VERSION = "0.1.0";
var TOOLS = [
  {
    name: "turpan.review_project",
    description: "Run a Turpan code review on a project. Returns findings, score, and verdict.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Absolute or relative path to the project to review" },
        mode: { type: "string", enum: ["quick", "deep"], description: "quick=fast analysis, deep=comprehensive", default: "quick" },
        includeUi: { type: "boolean", description: "Include live UI testing", default: false },
        includeRuntime: { type: "boolean", description: "Include runtime analysis", default: false },
        includeSecurity: { type: "boolean", description: "Include security checks", default: true },
        includeAgentAudit: { type: "boolean", description: "Run agent output audit if taskFile provided", default: false },
        taskFile: { type: "string", description: "Path to task/prompt file for agent audit" },
        fixMode: { type: "string", enum: ["patch-only", "apply"], description: "patch-only=generate diff only, apply=apply fixes", default: "patch-only" }
      },
      required: ["projectPath"]
    }
  },
  {
    name: "turpan.review_diff",
    description: "Review the diff between two git refs (branches, commits, tags).",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Path to the project" },
        baseRef: { type: "string", description: "Base git ref (e.g. main, v1.0.0)" },
        targetRef: { type: "string", description: "Target git ref to compare against baseRef" },
        includeUi: { type: "boolean", description: "Include UI checks in diff review", default: false },
        taskFile: { type: "string", description: "Optional task file for context" }
      },
      required: ["projectPath", "baseRef", "targetRef"]
    }
  },
  {
    name: "turpan.live_ui_test",
    description: "Run live UI tests using Playwright \u2014 start dev server, open browser, test routes.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Path to the project" },
        url: { type: "string", description: "Skip server start, use existing URL (e.g. http://localhost:3000)" },
        headed: { type: "boolean", description: "Run with visible browser", default: false },
        mobile: { type: "boolean", description: "Only test mobile viewport (390\xD7844)", default: false },
        trace: { type: "boolean", description: "Capture Playwright traces", default: false }
      },
      required: ["projectPath"]
    }
  },
  {
    name: "turpan.agent_output_audit",
    description: "Audit agent implementation against the original task \u2014 detect missing/shallow/fake implementations.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Path to the project" },
        taskFile: { type: "string", description: "Path to the task/prompt file given to the agent" },
        agentName: { type: "string", description: "Agent type (claude-code, opencode, cursor, etc.)" }
      },
      required: ["projectPath", "taskFile"]
    }
  },
  {
    name: "turpan.fix_findings",
    description: "Generate or apply fixes for Turpan findings. Default is patch-only \u2014 requires explicit fixMode: apply.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Path to the project" },
        runId: { type: "string", description: "Run ID to fix findings from (default: latest run)" },
        findingIds: { type: "array", items: { type: "string" }, description: "Specific finding IDs to fix (default: all)" },
        fixMode: { type: "string", enum: ["patch-only", "apply"], description: "patch-only=generate diff, apply=apply to working tree", default: "patch-only" }
      },
      required: ["projectPath", "fixMode"]
    }
  },
  {
    name: "turpan.get_report",
    description: "Retrieve the Turpan analysis report in the specified format.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Path to the project" },
        runId: { type: "string", description: "Run ID (default: latest)" },
        format: { type: "string", enum: ["markdown", "html", "json"], description: "Report format", default: "markdown" }
      },
      required: ["projectPath"]
    }
  },
  {
    name: "turpan.get_findings",
    description: "Retrieve findings from a Turpan run, optionally filtered by severity or category.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Path to the project" },
        runId: { type: "string", description: "Run ID (default: latest)" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"], description: "Filter by severity" },
        category: { type: "string", description: "Filter by category" }
      },
      required: ["projectPath"]
    }
  }
];
var TurpanMcpServer = class {
  server;
  config;
  projectPath = process.cwd();
  rateLimiter;
  concurrencyGuard;
  sessionId;
  currentRunId = null;
  constructor(config = {}) {
    this.sessionId = config.sessionId ?? randomUUID();
    this.config = {
      workspaceRoots: config.workspaceRoots ?? [],
      logLevel: config.logLevel ?? "info",
      serverName: config.serverName ?? DEFAULT_SERVER_NAME,
      version: config.version ?? DEFAULT_VERSION,
      rateLimit: config.rateLimit ?? DEFAULT_RATE_LIMIT,
      timeouts: config.timeouts ?? DEFAULT_TIMEOUTS,
      sessionId: this.sessionId,
      concurrencyGuardConfig: config.concurrencyGuardConfig ?? {},
      auditLogConfig: config.auditLogConfig ?? {}
    };
    if (this.config.workspaceRoots.length > 0) {
      setWorkspaceAllowlist(this.config.workspaceRoots);
      setGlobalAuditPath(this.config.workspaceRoots[0], this.config.auditLogConfig);
    } else {
      setGlobalAuditPath(process.cwd(), this.config.auditLogConfig);
    }
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.concurrencyGuard = new ConcurrencyGuard(this.config.concurrencyGuardConfig);
    this.server = new Server(
      {
        name: this.config.serverName,
        version: this.config.version
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {}
        }
      }
    );
    this.setupHandlers();
  }
  setupHandlers() {
    const { server } = this;
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      const args = rawArgs ?? {};
      const emitLog = (msg) => {
        server.notification({
          method: LoggingMessageNotificationSchema.shape.method.value,
          params: { level: this.config.logLevel, data: msg }
        });
      };
      const rateLimitError = this.rateLimiter.check(name);
      if (rateLimitError) {
        emitLog(`[RATE LIMIT] ${rateLimitError.message}`);
        return {
          content: [{ type: "text", text: JSON.stringify(rateLimitError.toJSON(), null, 2) }],
          isError: true
        };
      }
      const writeTools = ["turpan.review_project", "turpan.review_diff", "turpan.live_ui_test", "turpan.agent_output_audit"];
      let auditContext = null;
      if (writeTools.includes(name)) {
        const projectPath = args["projectPath"] ?? this.projectPath;
        const workspaceKey = this.config.workspaceRoots.length > 0 ? this.config.workspaceRoots.find((w) => projectPath.startsWith(w)) ?? projectPath : projectPath;
        const runId = generateRunId();
        this.currentRunId = runId;
        const busy = this.concurrencyGuard.tryClaim(workspaceKey, runId, name);
        if (busy) {
          emitLog(`[BUSY] Workspace already has an active review run: ${busy.runId}`);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "WORKSPACE_BUSY",
                  message: `Workspace is busy with an active review run (${busy.runId})`,
                  activeRunId: busy.runId,
                  activeSince: busy.startedAt,
                  activeTool: busy.toolName,
                  retryAfterMs: 3e4
                }
              }, null, 2)
            }],
            isError: true
          };
        }
        auditContext = new AuditContext({
          toolName: name,
          projectPath,
          workspace: workspaceKey,
          sessionId: this.sessionId,
          runId,
          input: args
        });
        const timeoutMs2 = getTimeoutForTool(name, this.config.timeouts);
        setTimeout(() => {
          const released = this.concurrencyGuard.releaseByRunIdWithReason(
            runId,
            `auto-release after ${timeoutMs2}ms timeout`
          );
          if (released) {
            emitLog(`[STALE CLEANUP] Run ${runId} auto-released after timeout (was active since ${released.startedAt})`);
          }
          this.currentRunId = null;
        }, timeoutMs2 + 1e3).unref();
      }
      const timeoutMs = getTimeoutForTool(name, this.config.timeouts);
      try {
        this.rateLimiter.record(name);
        let result;
        if (auditContext) {
          result = await withTimeout(name, timeoutMs, async () => {
            return await this.handleToolCall(name, args, emitLog, auditContext);
          });
          auditContext.succeed(JSON.stringify(result).slice(0, 500));
        } else {
          result = await withTimeout(
            name,
            timeoutMs,
            () => this.handleToolCall(name, args, emitLog, null)
          );
        }
        if (writeTools.includes(name)) {
          const projectPath = args["projectPath"] ?? this.projectPath;
          const workspaceKey = this.config.workspaceRoots.length > 0 ? this.config.workspaceRoots.find((w) => projectPath.startsWith(w)) ?? projectPath : projectPath;
          this.concurrencyGuard.release(workspaceKey);
          this.currentRunId = null;
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false
        };
      } catch (err) {
        if (writeTools.includes(name)) {
          const projectPath = args["projectPath"] ?? this.projectPath;
          const workspaceKey = this.config.workspaceRoots.length > 0 ? this.config.workspaceRoots.find((w) => projectPath.startsWith(w)) ?? projectPath : projectPath;
          this.concurrencyGuard.release(workspaceKey);
          this.currentRunId = null;
        }
        if (err instanceof ToolTimeoutError) {
          if (auditContext) auditContext.timeout(timeoutMs);
          emitLog(`[TIMEOUT] ${err.message}`);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "TOOL_TIMEOUT",
                  message: err.message,
                  toolName: err.toolName,
                  maxMs: err.maxMs
                }
              }, null, 2)
            }],
            isError: true
          };
        }
        if (err instanceof RateLimitError) {
          return {
            content: [{ type: "text", text: JSON.stringify(err.toJSON(), null, 2) }],
            isError: true
          };
        }
        if (auditContext) auditContext.fail(redactError(err));
        const safe = formatSafeError(err);
        emitLog(`[ERROR] ${safe.message}`);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: safe.message, code: safe.code }, null, 2) }],
          isError: true
        };
      }
    });
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = listTurpanResources(this.projectPath);
      return { resources };
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const parsed = this.parseAndValidateResourceUri(uri);
      if (!parsed.valid) {
        return {
          contents: [{ type: "text", text: `Invalid resource URI: ${parsed.error}` }],
          isError: true
        };
      }
      const result = readTurpanResource(this.projectPath, uri);
      if (!result) {
        return {
          contents: [{ type: "text", text: `Resource not found: ${uri}` }],
          isError: true
        };
      }
      return {
        contents: [{
          uri,
          mimeType: result.mimeType,
          text: result.content
        }]
      };
    });
    server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      this.config.logLevel = request.params.level;
      return {};
    });
  }
  /**
   * Parse and validate a resource URI before processing.
   * Blocks path traversal and ensures only turpan:// URIs are allowed.
   */
  parseAndValidateResourceUri(uri) {
    if (!uri.startsWith("turpan://")) {
      return { valid: false, error: `Unsupported protocol: ${uri.split("://")[0]}` };
    }
    const pathPart = uri.slice("turpan://".length);
    if (pathPart.includes("..") || pathPart.includes("\\")) {
      return { valid: false, error: "Path traversal not allowed in resource URI" };
    }
    if (!uri.match(/^turpan:\/\/runs\/[a-zA-Z0-9_:-]+\/[a-zA-Z0-9_.]+$/)) {
      return { valid: false, error: `Malformed turpan:// URI: ${uri}` };
    }
    return { valid: true };
  }
  async handleToolCall(name, args, emitLog, auditContext) {
    switch (name) {
      case "turpan.review_project": {
        const input = reviewProjectInputSchema.parse(args);
        if (this.config.workspaceRoots.length > 0) {
          const validated = validateProjectPath(input.projectPath);
          this.projectPath = validated.resolved;
        }
        return await reviewProject(input, emitLog);
      }
      case "turpan.review_diff": {
        const input = reviewDiffInputSchema.parse(args);
        return await reviewDiff(input, emitLog);
      }
      case "turpan.live_ui_test": {
        const input = liveUiTestInputSchema.parse(args);
        return await liveUiTest(input, emitLog);
      }
      case "turpan.agent_output_audit": {
        const input = agentOutputAuditInputSchema.parse(args);
        return await agentOutputAudit(input, emitLog);
      }
      case "turpan.fix_findings": {
        const input = fixFindingsInputSchema.parse(args);
        if (input.fixMode !== "patch-only" && input.fixMode !== "apply") {
          throw new Error('fixMode must be "patch-only" or "apply"');
        }
        return await fixFindings(input, emitLog);
      }
      case "turpan.get_report": {
        const input = getReportInputSchema.parse(args);
        return await getReport(input, emitLog);
      }
      case "turpan.get_findings": {
        const input = getFindingsInputSchema.parse(args);
        return await getFindings(input, emitLog);
      }
      default:
        return { error: `Unknown tool: ${name}`, code: "TOOL_NOT_FOUND" };
    }
  }
  /**
   * Start the MCP server using stdio transport.
   * This is the main entry point for MCP integration.
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
  /**
   * Get the configured workspace project path.
   */
  getProjectPath() {
    return this.projectPath;
  }
  /**
   * Set the active project path (for workspace-scoped mode).
   */
  setProjectPath(path) {
    this.projectPath = path;
  }
  /**
   * Get the session ID for this MCP connection.
   */
  getSessionId() {
    return this.sessionId;
  }
};

// src/security/rate-limiter.ts
import { appendFileSync } from "fs";
var DEFAULT_WINDOW_MS = 6e4;
var GLOBAL_AUDIT_PATH = ".turpan/mcp-audit.log";
var RateLimiter = class {
  global = { count: 0, windowStart: Date.now() };
  perTool = /* @__PURE__ */ new Map();
  config;
  constructor(config) {
    this.config = {
      ...config,
      windowMs: config.windowMs ?? DEFAULT_WINDOW_MS
    };
  }
  /**
   * Check if a call to `toolName` is allowed under the rate limit.
   * Returns null if allowed; returns a RateLimitError if rejected.
   */
  check(toolName) {
    const now = Date.now();
    const windowMs = this.config.windowMs;
    this.gcEntry(this.global, now, windowMs);
    if (this.global.count >= this.config.globalMaxPerMinute) {
      const retryAfterMs = windowMs - (now - this.global.windowStart);
      const error = new RateLimitError(
        "RATE_LIMIT_EXCEEDED",
        `Global rate limit exceeded: ${this.config.globalMaxPerMinute} calls per minute`,
        {
          limit: this.config.globalMaxPerMinute,
          windowMs,
          retryAfterMs: Math.max(0, retryAfterMs),
          currentUsed: this.global.count
        }
      );
      this.writeRateLimitAuditEvent(toolName, error);
      return error;
    }
    const toolLimit = this.config.perToolMaxPerMinute?.[toolName] ?? this.config.globalMaxPerMinute;
    let toolEntry = this.perTool.get(toolName);
    if (!toolEntry) {
      toolEntry = { count: 0, windowStart: now };
      this.perTool.set(toolName, toolEntry);
    }
    this.gcEntry(toolEntry, now, windowMs);
    if (toolEntry.count >= toolLimit) {
      const retryAfterMs = windowMs - (now - toolEntry.windowStart);
      const error = new RateLimitError(
        "RATE_LIMIT_EXCEEDED",
        `Rate limit exceeded for tool '${toolName}': ${toolLimit} calls per minute`,
        {
          limit: toolLimit,
          windowMs,
          retryAfterMs: Math.max(0, retryAfterMs),
          toolName,
          currentUsed: toolEntry.count
        }
      );
      this.writeRateLimitAuditEvent(toolName, error);
      return error;
    }
    return null;
  }
  /**
   * Record a call to `toolName`. Must be called after a successful check.
   */
  record(toolName) {
    const now = Date.now();
    const windowMs = this.config.windowMs;
    this.gcEntry(this.global, now, windowMs);
    this.global.count++;
    let toolEntry = this.perTool.get(toolName);
    if (!toolEntry) {
      toolEntry = { count: 0, windowStart: now };
      this.perTool.set(toolName, toolEntry);
    }
    this.gcEntry(toolEntry, now, windowMs);
    toolEntry.count++;
  }
  /**
   * Get current utilization snapshot (for status commands).
   */
  status() {
    const now = Date.now();
    const windowMs = this.config.windowMs;
    this.gcEntry(this.global, now, windowMs);
    const toolUsed = /* @__PURE__ */ new Map();
    const toolLimits = /* @__PURE__ */ new Map();
    for (const [name, entry] of this.perTool) {
      this.gcEntry(entry, now, windowMs);
      toolUsed.set(name, entry.count);
      toolLimits.set(name, this.config.perToolMaxPerMinute?.[name] ?? this.config.globalMaxPerMinute);
    }
    return {
      globalUsed: this.global.count,
      globalLimit: this.config.globalMaxPerMinute,
      toolUsed,
      toolLimits
    };
  }
  /**
   * Write a rate limit event to the audit log.
   */
  writeRateLimitAuditEvent(toolName, error) {
    try {
      const auditEntry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        event: "rate_limit_exceeded",
        status: "rejected",
        errorCode: error.code,
        errorMessage: redactSecrets(error.message),
        limit: error.limit,
        windowMs: error.windowMs,
        retryAfterMs: error.retryAfterMs,
        currentUsed: error.currentUsed ?? "unknown"
      };
      appendFileSync(GLOBAL_AUDIT_PATH, JSON.stringify(auditEntry) + "\n", "utf-8");
    } catch {
    }
  }
  /**
   * Update the rate limit config dynamically.
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  /**
   * Get current configuration.
   */
  getConfig() {
    return { ...this.config };
  }
  gcEntry(entry, now, windowMs) {
    if (now - entry.windowStart >= windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }
  }
};
var RateLimitError = class extends Error {
  code = "RATE_LIMIT_EXCEEDED";
  limit;
  windowMs;
  retryAfterMs;
  toolName;
  currentUsed;
  constructor(code, message, details) {
    super(message);
    this.name = "RateLimitError";
    this.limit = details.limit;
    this.windowMs = details.windowMs;
    this.retryAfterMs = details.retryAfterMs;
    this.toolName = details.toolName;
    this.currentUsed = details.currentUsed;
  }
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryAfterMs: this.retryAfterMs,
        limit: this.limit,
        windowMs: this.windowMs,
        toolName: this.toolName,
        currentUsed: this.currentUsed
      }
    };
  }
};
var DEFAULT_RATE_LIMIT = {
  globalMaxPerMinute: 60,
  perToolMaxPerMinute: {
    "turpan.review_project": 20,
    "turpan.review_diff": 20,
    "turpan.live_ui_test": 10,
    "turpan.agent_output_audit": 10,
    "turpan.fix_findings": 20,
    "turpan.get_report": 60,
    "turpan.get_findings": 60
  }
};

// src/security/timeouts.ts
var DEFAULT_TIMEOUTS = {
  timeouts: {
    "turpan.review_project": 3e5,
    // 5 minutes
    "turpan.review_diff": 3e5,
    "turpan.live_ui_test": 3e5,
    "turpan.agent_output_audit": 3e5,
    "turpan.fix_findings": 3e5,
    "turpan.get_report": 12e4,
    // 2 minutes
    "turpan.get_findings": 12e4
  }
};
var ToolTimeoutError = class extends Error {
  code = "TOOL_TIMEOUT";
  toolName;
  maxMs;
  constructor(toolName, maxMs) {
    super(`Tool '${toolName}' timed out after ${maxMs}ms`);
    this.name = "ToolTimeoutError";
    this.toolName = toolName;
    this.maxMs = maxMs;
  }
};
async function withTimeout(toolName, maxMs, fn) {
  return new Promise((resolve4, reject) => {
    const timer = setTimeout(() => {
      reject(new ToolTimeoutError(toolName, maxMs));
    }, maxMs);
    fn().then(resolve4).catch(reject).finally(() => clearTimeout(timer));
  });
}
function getTimeoutForTool(toolName, config) {
  return config.timeouts[toolName] ?? 3e5;
}

// src/security/audit-logger.ts
import { appendFileSync as appendFileSync2, existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync4, readdirSync as readdirSync3, statSync as statSync2, unlinkSync, writeFileSync } from "fs";
import { join as join4, basename } from "path";
import { randomUUID as randomUUID2 } from "crypto";
var globalAuditPath = null;
var globalAuditConfig = {
  maxSizeMb: 10,
  maxFiles: 5,
  dailyRotation: false
};
var lastRotationDate = null;
function setGlobalAuditPath(projectPath, config = {}) {
  const dir = join4(projectPath, ".turpan");
  if (!existsSync5(dir)) {
    mkdirSync2(dir, { recursive: true });
  }
  globalAuditPath = join4(dir, "mcp-audit.log");
  globalAuditConfig = { ...globalAuditConfig, ...config };
  lastRotationDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function setAuditLogConfig2(config) {
  globalAuditConfig = { ...globalAuditConfig, ...config };
}
function getAuditLogConfig() {
  return { ...globalAuditConfig };
}
function getAuditLogPath() {
  return globalAuditPath;
}
function generateRunId() {
  return `run_${Date.now()}_${randomUUID2().slice(0, 8)}`;
}
function checkAndRotate() {
  if (!globalAuditPath) return;
  const config = globalAuditConfig;
  const logFile = globalAuditPath;
  if (config.dailyRotation) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (lastRotationDate && today > lastRotationDate) {
      rotateLog(logFile, `daily-${lastRotationDate}`);
      lastRotationDate = today;
      return;
    }
    lastRotationDate = today;
  }
  if (config.maxSizeMb && config.maxSizeMb > 0) {
    try {
      if (existsSync5(logFile)) {
        const stats = statSync2(logFile);
        const sizeMb = stats.size / (1024 * 1024);
        if (sizeMb >= config.maxSizeMb) {
          rotateLog(logFile);
        }
      }
    } catch {
    }
  }
}
function rotateLog(logFile, suffix = "") {
  if (!existsSync5(logFile)) return;
  const timestamp = suffix || (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const rotatedName = `${logFile}.${timestamp}.gz`;
  const rotatedPath = rotateFileWithGzip(logFile, rotatedName);
  if (!rotatedPath) return;
  if (globalAuditConfig.maxFiles && globalAuditConfig.maxFiles > 0) {
    cleanupOldRotations(logFile, globalAuditConfig.maxFiles);
  }
}
function rotateFileWithGzip(sourcePath, destPath) {
  try {
    const content = readFileSync4(sourcePath, "utf-8");
    const gzipped = gzipSync(Buffer.from(content, "utf-8"));
    writeFileSync(destPath, gzipped);
    writeFileSync(sourcePath, "", "utf-8");
    return destPath;
  } catch {
    try {
      const content = readFileSync4(sourcePath, "utf-8");
      writeFileSync(destPath, content, "utf-8");
      writeFileSync(sourcePath, "", "utf-8");
      return destPath;
    } catch {
      return null;
    }
  }
}
function gzipSync(buf) {
  const { createGzip } = __require("zlib");
  const zlib = __require("zlib");
  return zlib.gzipSync(buf);
}
function cleanupOldRotations(basePath, maxFiles) {
  try {
    const dir = join4(basePath, "..");
    const baseName = basename(basePath);
    const rotated = readdirSync3(dir).filter((f) => f.startsWith(baseName + ".") && f !== baseName).map((f) => ({
      name: f,
      path: join4(dir, f),
      mtime: statSync2(join4(dir, f)).mtime.getTime()
    })).sort((a, b) => b.mtime - a.mtime);
    for (let i = maxFiles; i < rotated.length; i++) {
      try {
        unlinkSync(rotated[i].path);
      } catch {
      }
    }
  } catch {
  }
}
var AuditContext = class {
  startTime;
  entry;
  constructor(params) {
    this.startTime = Date.now();
    this.entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      toolName: params.toolName,
      projectPath: params.projectPath,
      workspace: params.workspace,
      sessionId: params.sessionId,
      callerId: params.callerId,
      runId: params.runId,
      inputSummary: redactObject(params.input),
      outputSummary: "",
      status: "success",
      durationMs: 0
    };
  }
  /**
   * Record a rejected call (rate limit, validation failure, etc.)
   */
  reject(reason, errorCode) {
    this.entry.status = "rejected";
    this.entry.outputSummary = reason;
    this.entry.errorCode = errorCode;
    this.finalize();
  }
  /**
   * Record a timeout.
   */
  timeout(maxMs) {
    this.entry.status = "timeout";
    this.entry.outputSummary = `Tool call timed out after ${maxMs}ms`;
    this.entry.errorCode = "TIMEOUT";
    this.finalize();
  }
  /**
   * Record a failure (thrown error).
   */
  fail(errorMessage, errorCode) {
    this.entry.status = "failure";
    this.entry.outputSummary = errorMessage;
    this.entry.errorCode = errorCode;
    this.finalize();
  }
  /**
   * Record success with output summary.
   */
  succeed(outputSummary) {
    this.entry.status = "success";
    this.entry.outputSummary = truncate(outputSummary, 500);
    this.finalize();
  }
  finalize() {
    this.entry.durationMs = Date.now() - this.startTime;
    const line = JSON.stringify(this.entry) + "\n";
    if (globalAuditPath) {
      try {
        checkAndRotate();
        appendFileSync2(globalAuditPath, line, "utf-8");
      } catch {
      }
    }
    if (this.entry.runId && this.entry.projectPath) {
      const runDir = join4(this.entry.projectPath, ".turpan", "runs", this.entry.runId);
      const scopedLog = join4(runDir, "mcp-audit.jsonl");
      try {
        if (!existsSync5(runDir)) {
          mkdirSync2(runDir, { recursive: true });
        }
        appendFileSync2(scopedLog, line, "utf-8");
      } catch {
      }
    }
    if (this.entry.runId) {
      this.updateRunIndex();
    }
  }
  updateRunIndex() {
    if (!this.entry.runId || !this.entry.projectPath) return;
    const indexPath = join4(this.entry.projectPath, ".turpan", "mcp-runs.jsonl");
    try {
      const indexEntry = {
        runId: this.entry.runId,
        tool: this.entry.toolName ?? "",
        projectPath: this.entry.projectPath,
        status: this.entry.status ?? "success",
        startedAt: this.entry.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: this.entry.durationMs
      };
      appendFileSync2(indexPath, JSON.stringify(indexEntry) + "\n", "utf-8");
    } catch {
    }
  }
};
function truncate(s, maxLen) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `... [truncated ${s.length - maxLen} chars]`;
}
function getRecentRuns(projectPath, limit = 10) {
  const indexPath = join4(projectPath, ".turpan", "mcp-runs.jsonl");
  if (!existsSync5(indexPath)) return [];
  try {
    const content = readFileSync4(indexPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = [];
    for (const line of lines.slice(-limit)) {
      try {
        entries.push(JSON.parse(line));
      } catch {
      }
    }
    return entries;
  } catch {
    return [];
  }
}
function getLastError(projectPath) {
  const logPath = join4(projectPath, ".turpan", "mcp-audit.log");
  if (!existsSync5(logPath)) return null;
  try {
    const content = readFileSync4(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i]);
      if (entry.status === "failure" || entry.status === "rejected") {
        return `${entry.errorCode ?? "ERROR"}: ${entry.outputSummary}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}
function logStaleRelease(event) {
  const entry = {
    timestamp: event.releasedAt,
    toolName: event.toolName,
    projectPath: event.workspace,
    workspace: event.workspace,
    runId: event.runId,
    inputSummary: {},
    outputSummary: `Concurrency lock released: ${event.reason}`,
    status: "success",
    durationMs: event.heldMs,
    event: "concurrency_lock_released",
    reason: event.reason,
    startedAt: event.startedAt,
    expiresAt: event.expiresAt,
    releasedAt: event.releasedAt,
    heldMs: event.heldMs
  };
  const line = JSON.stringify(entry) + "\n";
  if (globalAuditPath) {
    try {
      checkAndRotate();
      appendFileSync2(globalAuditPath, line, "utf-8");
    } catch {
    }
  }
  if (event.workspace) {
    const runDir = join4(event.workspace, ".turpan", "runs", event.runId);
    const scopedLog = join4(runDir, "mcp-audit.jsonl");
    try {
      if (!existsSync5(runDir)) {
        mkdirSync2(runDir, { recursive: true });
      }
      appendFileSync2(scopedLog, line, "utf-8");
    } catch {
    }
  }
}

// src/security/concurrency-guard.ts
var DEFAULT_STALE_TIMEOUT_MS = 5 * 60 * 1e3;
var DEFAULT_GRACE_PERIOD_MS = 30 * 1e3;
var ConcurrencyGuard = class {
  /** workspace root → active run info */
  activeRuns = /* @__PURE__ */ new Map();
  config;
  constructor(config = {}) {
    this.config = {
      staleTimeoutMs: config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS,
      gracePeriodMs: config.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS,
      onStaleRelease: config.onStaleRelease,
      onManualRelease: config.onManualRelease
    };
  }
  /**
   * Try to claim an active run slot for `workspace`.
   * Returns null if the slot is free; returns the existing ActiveRun if busy.
   * Stale locks are cleaned up before checking.
   */
  tryClaim(workspace, runId, toolName) {
    this.cleanupStaleLocks();
    const existing = this.activeRuns.get(workspace);
    if (existing) {
      const current = this.activeRuns.get(workspace);
      if (!current) return null;
      return current;
    }
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + this.config.staleTimeoutMs).toISOString();
    this.activeRuns.set(workspace, {
      runId,
      startedAt: now.toISOString(),
      toolName,
      expiresAt
    });
    return null;
  }
  /**
   * Check if a workspace has an active run (without claiming it).
   * Stale locks are cleaned up first.
   */
  getActiveRun(workspace) {
    this.cleanupStaleLocks();
    return this.activeRuns.get(workspace);
  }
  /**
   * Release the active run slot for `workspace`.
   */
  release(workspace) {
    const run = this.activeRuns.get(workspace);
    if (run) {
      this.fireReleaseEvent(workspace, run, "manual");
    }
    this.activeRuns.delete(workspace);
  }
  /**
   * Release by runId (useful when a run completes with a known runId).
   */
  releaseByRunId(runId) {
    for (const [workspace, run] of this.activeRuns) {
      if (run.runId === runId) {
        this.fireReleaseEvent(workspace, run, "manual");
        this.activeRuns.delete(workspace);
        return;
      }
    }
  }
  /**
   * Release by runId with a reason (for audit logging).
   * Returns the released run info if found.
   */
  releaseByRunIdWithReason(runId, reason) {
    for (const [workspace, run] of this.activeRuns) {
      if (run.runId === runId) {
        this.activeRuns.delete(workspace);
        this.fireReleaseEvent(workspace, run, "manual", reason);
        return run;
      }
    }
    return null;
  }
  /**
   * Get all currently active runs (without cleanup).
   */
  getAllActiveRuns() {
    return new Map(this.activeRuns);
  }
  /**
   * Get the current configuration.
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * Detect and auto-release stale locks.
   * A lock is stale if it has exceeded its expiry time + grace period.
   * Returns the list of stale workspaces that were cleaned up.
   */
  cleanupStaleLocks() {
    const now = Date.now();
    const staleWorkspaces = [];
    for (const [workspace, run] of this.activeRuns) {
      if (!run.expiresAt) continue;
      const expiryMs = new Date(run.expiresAt).getTime();
      const graceEndMs = expiryMs + this.config.gracePeriodMs;
      if (now > graceEndMs) {
        const reason = "grace_expired";
        this.fireReleaseEvent(workspace, run, reason);
        staleWorkspaces.push(workspace);
        this.activeRuns.delete(workspace);
      }
    }
    return staleWorkspaces;
  }
  /**
   * Fire a release event to the configured callback (for audit logging).
   * Never throws — best-effort.
   */
  fireReleaseEvent(workspace, run, reason, customReason) {
    const event = {
      workspace,
      runId: run.runId,
      toolName: run.toolName,
      startedAt: run.startedAt,
      expiresAt: run.expiresAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      releasedAt: (/* @__PURE__ */ new Date()).toISOString(),
      reason,
      heldMs: Date.now() - new Date(run.startedAt).getTime()
    };
    const callback = reason === "manual" ? this.config.onManualRelease : this.config.onStaleRelease;
    if (callback) {
      try {
        callback(event);
      } catch {
      }
    }
  }
  /**
   * Check if a specific workspace has a stale lock (for status reporting).
   */
  isStale(workspace) {
    const run = this.activeRuns.get(workspace);
    if (!run || !run.expiresAt) return false;
    const expiryMs = new Date(run.expiresAt).getTime();
    return Date.now() > expiryMs;
  }
  /**
   * Get time until a workspace lock expires (for status reporting).
   * Returns null if no active lock.
   */
  getTimeUntilExpiry(workspace) {
    const run = this.activeRuns.get(workspace);
    if (!run || !run.expiresAt) return null;
    const expiryMs = new Date(run.expiresAt).getTime();
    return Math.max(0, expiryMs - Date.now());
  }
};

// src/index.ts
var globalRateLimiter = null;
var globalConcurrencyGuard = null;
var globalProjectPath = process.cwd();
function getStatusRateLimiter() {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT);
  }
  return globalRateLimiter;
}
function getStatusConcurrencyGuard() {
  if (!globalConcurrencyGuard) {
    globalConcurrencyGuard = new ConcurrencyGuard();
  }
  return globalConcurrencyGuard;
}
function countAllRunsInIndex(projectPath) {
  const indexPath = join5(projectPath, ".turpan", "mcp-runs.jsonl");
  if (!existsSync6(indexPath)) return 0;
  try {
    const content = readFileSync5(indexPath, "utf-8");
    return content.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}
async function startServer(config) {
  const server = new TurpanMcpServer(config);
  globalProjectPath = config.workspaceRoots?.[0] ?? process.cwd();
  await server.start();
}
function createMcpServeCommand() {
  const cmd = new Command("serve");
  cmd.description("Start the Turpan MCP server (stdio transport)");
  cmd.option("-w, --workspace <path>", "Scope MCP access to a specific project directory").option("--log-level <level>", "Log level: debug | info | warn | error", "info").option("--max-calls-per-minute <n>", "Global max MCP calls per minute per client", parseInt, DEFAULT_RATE_LIMIT.globalMaxPerMinute).option("--max-tool-calls-per-minute <n>", "Max calls per individual tool per minute (overridden by per-tool flags)", parseInt, 20).option("--max-review-calls-per-minute <n>", "Max review_project calls per minute", parseInt, DEFAULT_RATE_LIMIT.perToolMaxPerMinute?.["turpan.review_project"] ?? 20).option("--max-ui-test-calls-per-minute <n>", "Max live_ui_test calls per minute", parseInt, DEFAULT_RATE_LIMIT.perToolMaxPerMinute?.["turpan.live_ui_test"] ?? 10).option("--audit-max-size-mb <n>", "Max audit log size in MB before rotation (0=disabled)", parseInt, 10).option("--audit-max-files <n>", "Max number of rotated audit log files to keep", parseInt, 5).option("--audit-daily-rotation", "Enable daily audit log rotation").option("--stale-lock-timeout-ms <n>", "Timeout in ms before a lock is considered stale", parseInt, 3e5).option("--stale-lock-grace-ms <n>", "Grace period in ms after stale detection before auto-release", parseInt, 3e4).action(async (options) => {
    const config = {
      logLevel: options.logLevel ?? "info"
    };
    if (options.workspace) {
      const workspacePath = resolve3(process.cwd(), options.workspace);
      if (!existsSync6(workspacePath)) {
        console.error(chalk.red(`
\u274C Workspace path does not exist: ${workspacePath}
`));
        process.exit(1);
      }
      config.workspaceRoots = [workspacePath];
      config.workspaceRoots.forEach((root) => setWorkspaceAllowlist([root]));
    }
    const auditConfig = {};
    if (options.auditMaxSizeMb !== void 0) {
      auditConfig.maxSizeMb = options.auditMaxSizeMb;
    }
    if (options.auditMaxFiles !== void 0) {
      auditConfig.maxFiles = options.auditMaxFiles;
    }
    if (options.auditDailyRotation) {
      auditConfig.dailyRotation = true;
    }
    const projectPath = options.workspace ? resolve3(process.cwd(), options.workspace) : process.cwd();
    setGlobalAuditPath(projectPath, auditConfig);
    const concurrencyConfig = {};
    if (options.staleLockTimeoutMs !== void 0) {
      concurrencyConfig.staleTimeoutMs = options.staleLockTimeoutMs;
    }
    if (options.staleLockGraceMs !== void 0) {
      concurrencyConfig.gracePeriodMs = options.staleLockGraceMs;
    }
    config.concurrencyGuardConfig = concurrencyConfig;
    const rateLimitConfig = {
      globalMaxPerMinute: options.maxCallsPerMinute ?? DEFAULT_RATE_LIMIT.globalMaxPerMinute,
      perToolMaxPerMinute: {
        ...DEFAULT_RATE_LIMIT.perToolMaxPerMinute,
        "turpan.review_project": options.maxReviewCallsPerMinute ?? 20,
        "turpan.review_diff": options.maxToolCallsPerMinute ?? 20,
        "turpan.live_ui_test": options.maxUiTestCallsPerMinute ?? 10,
        "turpan.agent_output_audit": options.maxToolCallsPerMinute ?? 10,
        "turpan.fix_findings": options.maxToolCallsPerMinute ?? 20,
        "turpan.get_report": options.maxCallsPerMinute ?? 60,
        "turpan.get_findings": options.maxCallsPerMinute ?? 60
      }
    };
    config.rateLimit = rateLimitConfig;
    config.timeouts = DEFAULT_TIMEOUTS;
    globalConcurrencyGuard = new ConcurrencyGuard({
      ...concurrencyConfig,
      onStaleRelease: (event) => {
        try {
          logStaleRelease(event);
        } catch {
        }
      },
      onManualRelease: (event) => {
        try {
          logStaleRelease(event);
        } catch {
        }
      }
    });
    globalRateLimiter = new RateLimiter(rateLimitConfig);
    globalProjectPath = projectPath;
    await startServer(config);
  });
  return cmd;
}
function createMcpConfigCommand() {
  const cmd = new Command("config");
  cmd.description("Show Turpan MCP server configuration for AI agent clients");
  cmd.option("--workspace <path>", "Show config scoped to a specific workspace").action(async (options) => {
    const workspacePath = options.workspace ? resolve3(process.cwd(), options.workspace) : null;
    const configJson = {
      mcpServers: {
        turpan: {
          command: "node",
          args: ["<path-to-turpan-mcp-dist>", "mcp", "serve", ...workspacePath ? ["--workspace", workspacePath] : []],
          env: {}
        }
      }
    };
    console.log(chalk.bold("\n\u{1F50C} Turpan MCP Server Configuration\n"));
    console.log(chalk.dim("Add this to your Claude Code MCP settings (~/.claude/settings.json):\n"));
    console.log(JSON.stringify(configJson, null, 2));
    console.log(chalk.dim("\nOr use the JSON config file at examples/mcp/turpan-mcp.json\n"));
    console.log(chalk.bold("Next steps:"));
    console.log(`  ${chalk.cyan("1. Copy the config above into your MCP settings")}`);
    console.log(`  ${chalk.cyan("2. Restart Claude Code or reload MCP servers")}`);
    console.log(`  ${chalk.cyan('3. Ask Turpan to review your project: "review the code in ./my-project"')}
`);
  });
  return cmd;
}
function createMcpStatusCommand() {
  const cmd = new Command("status");
  cmd.description("Check MCP server status and configuration");
  cmd.option("--project <path>", "Path to the project (default: cwd)").action(async (options) => {
    const projectPath = options.project ? resolve3(process.cwd(), options.project) : globalProjectPath;
    const roots = getWorkspaceAllowlist();
    const auditPath = getAuditLogPath();
    const auditCfg = getAuditLogConfig();
    const concurrencyCfg = getStatusConcurrencyGuard().getConfig();
    const recentRuns = getRecentRuns(projectPath, 10);
    const lastErr = getLastError(projectPath);
    const rateLimitStatus = getStatusRateLimiter().status();
    console.log(chalk.bold("\n\u{1F50D} Turpan MCP Status\n"));
    console.log(chalk.bold("Workspace:"));
    console.log(`  Allowlist roots: ${roots.length > 0 ? roots.map((r) => chalk.cyan(r)).join(", ") : chalk.dim("(none \u2014 all paths allowed)")}`);
    console.log(`  Project path:    ${chalk.cyan(projectPath)}`);
    console.log();
    console.log(chalk.bold("Concurrency Guard:"));
    const activeRuns = getStatusConcurrencyGuard().getAllActiveRuns();
    if (activeRuns.size > 0) {
      for (const [workspace, run] of activeRuns) {
        const timeLeft = getStatusConcurrencyGuard().getTimeUntilExpiry(workspace);
        console.log(`  Active run:      ${chalk.yellow(run.runId)}`);
        console.log(`    Tool:          ${run.toolName}`);
        console.log(`    Started:       ${run.startedAt}`);
        console.log(`    Expires in:    ${timeLeft !== null ? chalk.cyan(`${Math.round(timeLeft / 1e3)}s`) : chalk.dim("(no expiry)")}`);
        console.log(`    Workspace:     ${workspace}`);
      }
    } else {
      console.log(`  Active run:      ${chalk.dim("(none)")}`);
    }
    console.log(`  Stale timeout:  ${chalk.cyan(`${(concurrencyCfg.staleTimeoutMs ?? 3e5) / 1e3}s`)}`);
    console.log(`  Grace period:   ${chalk.cyan(`${(concurrencyCfg.gracePeriodMs ?? 3e4) / 1e3}s`)}`);
    console.log();
    console.log(chalk.bold("Rate Limits:"));
    console.log(`  Global:        ${chalk.cyan(`${rateLimitStatus.globalUsed}/${rateLimitStatus.globalLimit}`)} calls/min`);
    for (const [tool, used] of rateLimitStatus.toolUsed) {
      const limit = rateLimitStatus.toolLimits.get(tool) ?? rateLimitStatus.globalLimit;
      console.log(`  ${tool}: ${chalk.cyan(`${used}/${limit}`)} calls/min`);
    }
    console.log();
    console.log(chalk.bold("Audit Log:"));
    console.log(`  Path:          ${auditPath ? chalk.cyan(auditPath) : chalk.dim("(not set)")}`);
    console.log(`  Max size:      ${auditCfg.maxSizeMb ? chalk.cyan(`${auditCfg.maxSizeMb}MB`) : chalk.dim("(disabled)")}`);
    console.log(`  Max files:     ${auditCfg.maxFiles ? chalk.cyan(`${auditCfg.maxFiles}`) : chalk.dim("(disabled)")}`);
    console.log(`  Daily rotate:  ${auditCfg.dailyRotation ? chalk.cyan("enabled") : chalk.dim("disabled")}`);
    console.log();
    console.log(chalk.bold("Recent Runs:"));
    const totalRunsCount = countAllRunsInIndex(projectPath);
    console.log(`  Total recorded runs: ${chalk.cyan(totalRunsCount)} (showing last ${Math.min(5, recentRuns.length)})`);
    if (recentRuns.length > 0) {
      for (const run of recentRuns.slice(-5)) {
        const duration = run.durationMs !== void 0 ? `${Math.round(run.durationMs / 1e3)}s` : "-";
        const statusColor = run.status === "success" ? chalk.green : run.status === "failure" ? chalk.red : run.status === "timeout" ? chalk.yellow : chalk.dim;
        console.log(`  ${statusColor(run.status.padEnd(8))} ${chalk.cyan(run.runId)} ${run.tool} ${chalk.dim(`${duration} \xB7 ${run.startedAt}`)}`);
      }
    } else {
      console.log(`  ${chalk.dim("(no runs recorded)")}`);
    }
    console.log();
    if (lastErr) {
      console.log(chalk.bold("Last Error:"));
      console.log(`  ${chalk.red(lastErr)}`);
      console.log();
    }
    console.log(chalk.bold("Protocol:        ") + `${chalk.cyan("stdio (MCP over stdin/stdout)")}`);
    console.log(chalk.bold("Transport:       ") + `${chalk.cyan("@modelcontextprotocol/sdk v1.29+")}`);
    console.log(chalk.bold("Security:        ") + `${chalk.green("read-only default, patch-only fixes")}`);
    console.log();
  });
  return cmd;
}
async function runMcpCommand(argv) {
  const program = new Command();
  program.name("turpan mcp").description("\u{1F42A} Turpan MCP Server \u2014 AI agent interface for code review, testing, and fixing");
  program.addCommand(createMcpServeCommand());
  program.addCommand(createMcpConfigCommand());
  program.addCommand(createMcpStatusCommand());
  const fullArgv = argv[0] === "node" || argv[0]?.endsWith?.("node") ? argv : ["node", "turpan-mcp", ...argv];
  await program.parseAsync(fullArgv);
}
var isDirectExecution = (() => {
  if (!process.argv[1]) return false;
  const entryPath = process.argv[1].replace(/\\/g, "/");
  return import.meta.url === `file://${entryPath}` || entryPath.endsWith("/mcp-server/dist/index.js") || entryPath.endsWith("/turpan-mcp") || entryPath.endsWith("/turpan-mcp.js");
})();
if (isDirectExecution) {
  runMcpCommand(process.argv.slice(2)).catch((err) => {
    console.error(chalk.red(`
\u274C MCP error: ${err.message}
`));
    process.exit(1);
  });
}
export {
  AuditContext,
  ConcurrencyGuard,
  DEFAULT_RATE_LIMIT,
  DEFAULT_TIMEOUTS,
  RateLimitError,
  RateLimiter,
  ToolTimeoutError,
  generateRunId,
  getAuditLogConfig,
  getAuditLogPath,
  getLastError,
  getRecentRuns,
  getTimeoutForTool,
  runMcpCommand,
  setAuditLogConfig2 as setAuditLogConfig,
  setGlobalAuditPath,
  withTimeout
};
//# sourceMappingURL=index.js.map