#!/usr/bin/env node
import { Command } from 'commander';
import chalk16 from 'chalk';
import { dirname, join, resolve } from 'path';
import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { spawnSync, execSync } from 'child_process';
import { runAnalysis, loadConfig, detectProject, PluginRegistry, loadPlugins, PluginTrustDb, DEFAULT_TRUSTED_PLUGINS, PLUGIN_PERMISSIONS, PERMISSION_DESCRIPTIONS, formatFingerprintSummary, runReview } from '@turpan/core';
import { runUiTest, scenarioRegistry } from '@turpan/ui-runner';
import { runAgentOutputAudit } from '@turpan/analyzers';
import { resolveProjectPath, getGitInfo } from '@turpan/shared';
import inquirer from 'inquirer';
import { buildFixPlan, summarizePlan, buildFixRunResult, writeFixReport, shouldRollback, getCurrentCommitHash, saveRollbackRecord } from '@turpan/fix-engine';
import { fileURLToPath } from 'url';
import { runDependencyAudit } from '@turpan/dependency-audit';
import { GitDiffEngine } from '@turpan/git-diff';
import { deriveVerdict, generateReports, ReportOpenCommand } from '@turpan/report';
import { runMcpCommand } from '@turpan/mcp-server';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/commands/postPrComment.ts
var postPrComment_exports = {};
__export(postPrComment_exports, {
  createPostPrCommentCommand: () => createPostPrCommentCommand
});
function createPostPrCommentCommand() {
  const cmd = new Command("post-pr-comment");
  cmd.description("Post or update a sticky PR comment with Turpan review results").requiredOption("--run-path <path>", "Path to the Turpan run directory containing TURPAN_PR_COMMENT.md").option("--pr-number <number>", "PR number (for display only)", void 0).option("--token <token>", "GitHub token (or set GITHUB_TOKEN env var)", void 0).option("--update", "Update existing sticky comment (default: true)", true).option("--dry-run", "Print comment without posting", false).action(async (options) => {
    const runPath = options.runPath;
    const prCommentPath = join(runPath, "TURPAN_PR_COMMENT.md");
    if (!existsSync(prCommentPath)) {
      console.error(chalk16.red(`
\u274C TURPAN_PR_COMMENT.md not found at: ${prCommentPath}
`));
      console.error(chalk16.dim("  Run `turpan review . --from <base> --to <head>` first.\n"));
      process.exit(1);
    }
    let commentContent = readFileSync(prCommentPath, "utf-8");
    const token = options.token ?? process.env.GITHUB_TOKEN;
    if (!options.dryRun && !token) {
      console.error(chalk16.red("\n\u274C GITHUB_TOKEN is required to post comments.\n"));
      console.error(chalk16.dim("  Set the GITHUB_TOKEN environment variable or pass --token\n"));
      process.exit(1);
    }
    commentContent = redactSecrets(commentContent);
    if (commentContent !== readFileSync(prCommentPath, "utf-8")) {
      console.log(chalk16.yellow("\u26A0\uFE0F  Some secrets were redacted from the comment.\n"));
    }
    const truncated = commentContent.length > MAX_COMMENT_LENGTH;
    if (truncated) {
      const excess = commentContent.length - MAX_COMMENT_LENGTH;
      console.log(chalk16.yellow(`\u26A0\uFE0F  Comment exceeds ${MAX_COMMENT_LENGTH} chars \u2014 truncating ${excess} chars
`));
      const footer = "\n\n--- _(comment truncated \u2014 see full report in artifacts)_";
      commentContent = commentContent.slice(0, MAX_COMMENT_LENGTH - footer.length) + footer;
    }
    const wrappedComment = `${STICKY_MARKER}

${commentContent}

${STICKY_MARKER}`;
    if (options.dryRun) {
      console.log(chalk16.bold("\n\u{1F4CB} Dry run \u2014 comment to be posted:\n"));
      console.log(chalk16.dim("\u2500".repeat(60)));
      console.log(wrappedComment);
      console.log(chalk16.dim("\u2500".repeat(60)));
      console.log(chalk16.dim(`
(${wrappedComment.length} characters)
`));
      return;
    }
    if (!token) {
      console.error(chalk16.red("\n\u274C No GitHub token available.\n"));
      process.exit(1);
    }
    console.log(chalk16.bold("\n\u{1F42A} Posting PR Comment\n"));
    if (options.prNumber) {
      console.log(chalk16.dim(`PR: #${options.prNumber}`));
    }
    console.log(chalk16.dim(`File: ${prCommentPath}`));
    console.log(chalk16.dim(`Chars: ${wrappedComment.length}${truncated ? " (truncated)" : ""}
`));
    try {
      await postOrUpdateComment(token, wrappedComment, options.update ?? true);
      console.log(chalk16.green("\u2705 PR comment posted successfully!\n"));
    } catch (err) {
      console.error(chalk16.red(`
\u274C Failed to post comment: ${err instanceof Error ? err.message : err}
`));
      process.exit(1);
    }
  });
  return cmd;
}
async function postOrUpdateComment(token, comment, update) {
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const owner = process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "";
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
  const prNumber = process.env.PR_NUMBER ?? "";
  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY env var not set \u2014 cannot determine repo for PR comment");
  }
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
  if (update) {
    const existingId = await findStickyCommentId(token, owner, repo, prNumber, headers);
    if (existingId) {
      console.log(chalk16.dim(`  Updating existing comment #${existingId}
`));
      const res2 = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues/comments/${existingId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body: comment })
      });
      if (!res2.ok) {
        const body = await res2.text();
        throw new Error(`PATCH /issues/comments/${existingId} failed: ${res2.status} ${body}`);
      }
      return;
    }
    console.log(chalk16.dim("  No existing sticky comment found \u2014 posting new comment\n"));
  }
  const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: comment })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /issues/${prNumber}/comments failed: ${res.status} ${body}`);
  }
}
async function findStickyCommentId(token, owner, repo, prNumber, headers) {
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const res = await fetch(`${apiUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "GET",
    headers
  });
  if (!res.ok) return null;
  const comments = await res.json();
  for (const c of comments) {
    if (c.body.includes(STICKY_MARKER)) {
      return c.id;
    }
  }
  return null;
}
function redactSecrets(content) {
  let redacted = content;
  redacted = redacted.replace(/Bearer [\w.-]+/g, "Bearer [REDACTED]");
  redacted = redacted.replace(/\b[0-9a-f]{32,}\b/gi, "[REDACTED_KEY]");
  redacted = redacted.replace(/(export\s+)?([A-Z_]+)=[^\s`]{8,}/g, "$2=[REDACTED]");
  redacted = redacted.replace(/https?:\/\/[^:]+:[^@]+@/g, "https://[REDACTED]@");
  redacted = redacted.replace(/\b[A-Za-z0-9+/]{60,}={0,2}\b/g, "[REDACTED_SECRET]");
  return redacted;
}
var STICKY_MARKER, MAX_COMMENT_LENGTH;
var init_postPrComment = __esm({
  "src/commands/postPrComment.ts"() {
    STICKY_MARKER = "<!-- turpan-pr-review sticky comment -->";
    MAX_COMMENT_LENGTH = 65536;
  }
});
function createRuntimeTestCommand() {
  const cmd = new Command("runtime-test");
  cmd.description("Run runtime safety review for Python bots, FastAPI, CLI tools, workers, and MCP servers").argument("[path]", "Project path to test", ".").option("--runtime", "Enable runtime analyzers (Python, FastAPI, Node, CLI, Worker, MCP)", true).action(async (path, options) => {
    const projectPath = resolveProjectPath(path);
    console.log(chalk16.bold("\n\u{1F42A} Turpan Runtime Test\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    console.log(chalk16.dim("Mode: Non-UI runtime review\n"));
    console.log(chalk16.cyan("\u23F3 Analyzing runtime characteristics...\n"));
    try {
      const fingerprint = detectProject(projectPath);
      const runtimeTypes = [];
      if (fingerprint.languages.includes("python")) runtimeTypes.push("Python");
      if (fingerprint.appType === "fastapi" || fingerprint.backendFramework === "fastapi") runtimeTypes.push("FastAPI");
      if (fingerprint.appType === "python-bot" || fingerprint.appType === "telegram-bot") runtimeTypes.push("Python Bot");
      if (fingerprint.appType === "node-backend") runtimeTypes.push("Node Backend");
      if (fingerprint.entrypoints.some((e) => e.type === "cli")) runtimeTypes.push("CLI");
      if (fingerprint.appType === "mcp-server") runtimeTypes.push("MCP Server");
      console.log(chalk16.bold("Runtime Profile:"));
      console.log(chalk16.dim("\u2500".repeat(40)));
      console.log(`  Languages:  ${fingerprint.languages.join(", ")}`);
      console.log(`  App Type:   ${fingerprint.appType}`);
      console.log(`  Detected:   ${runtimeTypes.length > 0 ? runtimeTypes.join(", ") : "standard project"}`);
      console.log(`  Entrypoints: ${fingerprint.entrypoints.map((e) => e.name).join(", ") || "none"}`);
      console.log(chalk16.dim("\u2500".repeat(40) + "\n"));
      const { runAnalysis: runAnalysis4 } = await import('@turpan/core');
      const runPath = await runAnalysis4({
        projectPath,
        isInteractive: false,
        deepAnalysis: false,
        skipBuild: true,
        skipTests: true,
        skipLint: true,
        skipTypecheck: true,
        skipSecurity: true,
        skipUi: true
      });
      process.stdout.write("\r");
      console.log(chalk16.bold("\u{1F42A} Runtime Test Complete\n"));
      console.log(chalk16.green("\u2705 Non-UI runtime review finished!\n"));
      console.log(chalk16.dim(`Reports at: ${runPath}
`));
      console.log(`  ${chalk16.cyan("TURPAN_ANALYSIS.md")}    \u2014 Runtime Review section`);
      console.log(`  ${chalk16.cyan("TURPAN_FINDINGS.json")}   \u2014 All findings
`);
      console.log(chalk16.dim("Note: Runtime analyzers run Python import checks, FastAPI endpoint probes,\n"));
      console.log(chalk16.dim("      CLI help/version validation, Worker pattern checks, and MCP security audits.\n"));
      console.log(chalk16.dim("      No destructive commands are executed.\n"));
    } catch (error) {
      process.stdout.write("\r");
      console.error(chalk16.red(`
\u274C Runtime test failed: ${error}
`));
      process.exit(1);
    }
  });
  return cmd;
}
async function loadFindings(projectRoot, findingsPath) {
  if (findingsPath && existsSync(findingsPath)) {
    try {
      const raw = readFileSync(findingsPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.findings)) return parsed.findings;
      return [];
    } catch {
      return [];
    }
  }
  const latestFindings = join(projectRoot, ".turpan", "runs", "latest", "TURPAN_FINDINGS.json");
  if (existsSync(latestFindings)) {
    try {
      const raw = readFileSync(latestFindings, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.findings)) return parsed.findings;
    } catch {
    }
  }
  return [];
}
async function confirmCandidate(candidate) {
  const fileName = candidate.filePath.split("/").pop() ?? candidate.filePath;
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: chalk16.cyan(`Apply fix: ${candidate.description} (${fileName}:${candidate.startLine})?`),
      choices: [
        { name: "\u2705 Apply this fix", value: "apply" },
        { name: "\u23ED  Skip this fix", value: "skip" },
        { name: "\u{1F6D1} Abort all remaining fixes", value: "abort" }
      ],
      default: "apply"
    }
  ]);
  return {
    action,
    candidateId: candidate.id
  };
}
async function runFixEngine(opts) {
  const { projectRoot, fixMode, findingsPath, skipValidation } = opts;
  console.log(chalk16.bold("\n\u{1F527} Turpan Safe Fix Engine\n"));
  console.log(chalk16.dim(`Project: ${projectRoot}`));
  console.log(chalk16.dim(`Mode:    ${fixMode}
`));
  const gitInfo = getGitInfo(projectRoot);
  const gitDirty = gitInfo?.isDirty ?? false;
  if (gitDirty) {
    console.log(chalk16.yellow("\u26A0\uFE0F  Git working tree is dirty \u2014 uncommitted changes exist."));
    if (fixMode === "apply" || fixMode === "auto-safe") {
      console.log(chalk16.yellow("   Patches may conflict. Prefer --patch-only or --interactive.\n"));
    }
  }
  if (gitInfo) {
    console.log(chalk16.dim(`   Branch: ${gitInfo.branch} | Commit: ${gitInfo.commitHash}`));
  }
  console.log(chalk16.cyan("\u{1F4CB} Loading findings\u2026"));
  let findings = [];
  let runPath = join(projectRoot, ".turpan", "runs", "fix-" + Date.now().toString(36));
  if (opts.runReviewFirst) {
    console.log(chalk16.cyan("\u{1F50D} Running review to collect findings\u2026\n"));
    const { runAnalysis: runAnalysis4 } = await import('@turpan/core').then((m) => ({ runAnalysis: m.runAnalysis }));
    try {
      runPath = await runAnalysis4({
        projectPath: projectRoot,
        deepAnalysis: opts.reviewOptions?.deep ?? true,
        timeoutMs: opts.reviewOptions?.timeoutMs ?? 12e4,
        skipBuild: false,
        skipTests: false,
        skipLint: false,
        skipTypecheck: false
      });
      const fp = join(runPath, "TURPAN_FINDINGS.json");
      findings = await loadFindings(projectRoot, fp);
    } catch (err) {
      console.warn(chalk16.yellow(`\u26A0\uFE0F  Review failed, continuing with existing findings: ${err}`));
      findings = await loadFindings(projectRoot, void 0);
    }
  } else {
    findings = await loadFindings(projectRoot, findingsPath);
  }
  if (findings.length === 0) {
    console.log(chalk16.yellow("\n\u26A0\uFE0F  No findings found. Run `turpan review .` first or use --review flag.\n"));
    throw new Error("No findings to fix");
  }
  console.log(chalk16.dim(`   Found ${findings.length} findings
`));
  console.log(chalk16.cyan("\u{1F4DD} Building fix plan\u2026"));
  const plan = buildFixPlan({
    projectRoot,
    fixMode,
    findings
  });
  if (plan.candidates.length === 0) {
    console.log(chalk16.yellow("\n\u26A0\uFE0F  No fixable candidates found.\n"));
    throw new Error("No fixable candidates");
  }
  console.log(chalk16.dim(summarizePlan(plan)));
  console.log();
  const confirmedCandidates = [...plan.applied];
  if (fixMode === "interactive") {
    console.log(chalk16.bold("Interactive mode \u2014 confirm each fix:\n"));
    for (const candidate of plan.deferred) {
      const result2 = await confirmCandidate(candidate);
      if (result2.action === "abort") {
        console.log(chalk16.yellow("\n\u26D4 Fix session aborted.\n"));
        break;
      }
      if (result2.action === "apply") {
        confirmedCandidates.push(candidate);
      }
    }
  }
  if (confirmedCandidates.length === 0) {
    console.log(chalk16.yellow("\n\u26A0\uFE0F  No fixes to apply.\n"));
    const { generatePatch: generatePatch2 } = await import('@turpan/fix-engine');
    const patch = await import('@turpan/fix-engine').then((m) => m.generatePatch);
    const patchResult2 = patch(confirmedCandidates);
    const validation2 = { allPassed: true, results: [], totalDurationMs: 0 };
    const result2 = buildFixRunResult(plan, patchResult2, validation2, {
      gitDirty: false,
      workedInWorktree: false
    });
    const reportPaths2 = writeFixReport(plan, result2, patchResult2.patchContent, projectRoot);
    console.log(chalk16.dim(`Fix plan: ${reportPaths2.fixPlanPath}
`));
    return result2;
  }
  console.log(chalk16.cyan(`\u{1F527} Applying ${confirmedCandidates.length} fix(es)\u2026
`));
  const dryRun = fixMode === "patch-only" || fixMode === "report-only";
  const useWorktree = !dryRun && (fixMode === "apply" || fixMode === "auto-safe");
  const { applyFixCandidates: applyFn } = await import('@turpan/fix-engine');
  const applyResult = await applyFn(confirmedCandidates, {
    projectRoot,
    runId: plan.runId,
    useWorktree,
    dryRun,
    backup: true
  });
  if (!applyResult.success) {
    console.error(chalk16.red(`
\u274C Failed to apply fixes: ${applyResult.error}
`));
    throw new Error(applyResult.error);
  }
  if (dryRun) {
    console.log(chalk16.green("\u2705 Patch generated (dry run \u2014 no files modified)\n"));
  } else {
    console.log(chalk16.green(`\u2705 Applied ${applyResult.modified.length} file change(s)
`));
  }
  let validation = { allPassed: true, results: [], totalDurationMs: 0 };
  if (!skipValidation && !dryRun) {
    console.log(chalk16.cyan("\u{1F52C} Validating (build, typecheck, lint, test)\u2026\n"));
    const { verifyPatch: verifyPatch2 } = await import('@turpan/fix-engine');
    const { aggregateRequiredChecks } = await import('@turpan/fix-engine');
    const checks = aggregateRequiredChecks(confirmedCandidates);
    validation = await verifyPatch2(confirmedCandidates, {
      projectRoot,
      checks,
      timeoutMs: 12e4
    });
    const passedColor = validation.allPassed ? chalk16.green : chalk16.red;
    const statusIcon = validation.allPassed ? "\u2705" : "\u274C";
    console.log(passedColor(`
${statusIcon} Validation: ${validation.allPassed ? "PASSED" : "FAILED"}`));
    console.log(chalk16.dim(`   Completed in ${Math.round(validation.totalDurationMs / 1e3)}s
`));
    for (const r of validation.results) {
      const icon = r.passed ? chalk16.green("\u2713") : chalk16.red("\u2717");
      const checkLabel = r.check.padEnd(12);
      console.log(`   ${icon} ${checkLabel} ${chalk16.dim(`${Math.round(r.durationMs / 1e3)}s`)}`);
      if (r.error) console.log(chalk16.dim(`      ${r.error.slice(0, 80)}`));
    }
    console.log();
    if (shouldRollback(validation)) {
      console.error(chalk16.red("\n\u{1F6A8} Validation failed \u2014 rolling back changes!\n"));
      const { rollback: rollbackFn } = await import('@turpan/fix-engine');
      const rollbackOutcome = await rollbackFn({
        projectRoot,
        runId: plan.runId,
        reason: `Validation failed: ${validation.results.find((r) => !r.passed)?.check}`,
        worktreePath: applyResult.worktreePath,
        appliedFingerprint: getCurrentCommitHash(projectRoot)
      });
      console.error(chalk16.red(`
\u26A0\uFE0F  Rollback: ${rollbackOutcome.success ? "SUCCESS" : "PARTIAL/FAILED"}
`));
      if (rollbackOutcome.failedFiles.length > 0) {
        console.error(chalk16.red(`   Failed to restore: ${rollbackOutcome.failedFiles.join(", ")}
`));
      }
      const rollbackRecordPath = saveRollbackRecord(rollbackOutcome.record, projectRoot);
      console.error(chalk16.dim(`   Rollback record: ${rollbackRecordPath}
`));
    }
  }
  const { generatePatch } = await import('@turpan/fix-engine');
  const patchResult = generatePatch(confirmedCandidates);
  const result = buildFixRunResult(plan, patchResult, validation, {
    gitDirty,
    workedInWorktree: !!applyResult.worktreePath
  });
  const reportPaths = writeFixReport(plan, result, patchResult.patchContent, projectRoot);
  console.log(chalk16.bold("\n\u{1F4C4} Reports written:\n"));
  console.log(`   ${chalk16.cyan(reportPaths.fixPlanPath)}`);
  console.log(`   ${chalk16.cyan(reportPaths.patchDiffPath)}`);
  console.log(`   ${chalk16.cyan(reportPaths.resultJsonPath)}
`);
  return result;
}
function resolveFixMode(options) {
  const modes = [];
  if (options.patchOnly) modes.push("patch-only");
  if (options.apply) modes.push("apply");
  if (options.interactive) modes.push("interactive");
  if (options.autoSafe) modes.push("auto-safe");
  if (modes.length > 1) {
    throw new Error(`Conflicting fix modes specified: ${modes.join(", ")}`);
  }
  if (modes.length === 1) return modes[0];
  if (options.fix) return "patch-only";
  return "report-only";
}

// src/commands/fixCommand.ts
function createFixCommand() {
  const cmd = new Command("fix");
  cmd.description("Apply safe code fixes based on findings from a prior review").argument("[path]", "Project path to fix", ".").option("--patch-only", "Generate patch diffs without applying (default)", false).option("--apply", "Apply fixes to the working tree", false).option("--interactive", "Ask before applying each fix", false).option("--auto-safe", "Automatically apply only safe fix categories", false).option("--review", "Run a new review first to collect findings", false).option("--deep", "Run deep review (used with --review)", false).option("--timeout <seconds>", "Timeout per command (used with --review)", "120").option("--findings <file>", "Path to a specific findings JSON file").option("--skip-validation", "Skip post-apply validation checks", false).action(async (path, options) => {
    const projectPath = resolve(process.cwd(), path);
    if (!existsSync(projectPath)) {
      console.error(chalk16.red(`
\u274C Project path does not exist: ${projectPath}
`));
      process.exit(1);
    }
    resolveFixMode({
      patchOnly: options.patchOnly,
      apply: options.apply,
      interactive: options.interactive,
      autoSafe: options.autoSafe,
      fix: false
    });
    const modeCount = [options.patchOnly, options.apply, options.interactive, options.autoSafe].filter(Boolean).length;
    if (modeCount > 1) {
      console.error(chalk16.red(`
\u274C Conflicting options: choose only one of --patch-only, --apply, --interactive, --auto-safe
`));
      process.exit(1);
    }
    const resolvedMode = options.apply ? "apply" : options.interactive ? "interactive" : options.autoSafe ? "auto-safe" : "patch-only";
    const timeoutMs = (parseInt(options.timeout ?? "120") || 120) * 1e3;
    console.log(chalk16.bold("\n\u{1F527} Turpan Safe Fix\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    console.log(chalk16.dim(`Mode:   ${chalk16.cyan(resolvedMode)}
`));
    if (resolvedMode === "apply" || resolvedMode === "auto-safe") {
      console.log(chalk16.yellow("\u26A0\uFE0F  This will modify files. Use "));
      console.log(chalk16.yellow("\u26A0\uFE0F  Make sure you have a backup or the git working tree is clean.\n"));
    }
    try {
      const result = await runFixEngine({
        projectRoot: projectPath,
        fixMode: resolvedMode,
        findingsPath: options.findings,
        runReviewFirst: options.review,
        reviewOptions: { deep: options.deep, timeoutMs },
        skipValidation: options.skipValidation
      });
      const verdictColor = result.validation.allPassed ? chalk16.green : chalk16.red;
      const icon = result.validation.allPassed ? "\u2705" : "\u26A0\uFE0F";
      console.log(chalk16.bold(`
${icon} Fix run complete`));
      console.log(chalk16.dim(`   Mode: ${resolvedMode}`));
      console.log(`   Applied: ${chalk16.green(String(result.applied.length))}`);
      console.log(`   Rejected: ${result.rejected.length}`);
      console.log(`   Deferred: ${result.deferred.length}`);
      console.log(`   Validation: ${verdictColor(result.validation.allPassed ? "PASSED" : "FAILED")}`);
      console.log();
      if (result.patchResult.filesModified.length > 0) {
        console.log(chalk16.bold("Files modified:"));
        for (const f of result.patchResult.filesModified) {
          console.log(`   ${chalk16.cyan(f)}`);
        }
        console.log();
      }
      if (result.rollback) {
        console.error(chalk16.red("\n\u{1F6A8} Rollback was triggered due to validation failure.\n"));
        process.exit(1);
      }
      if (!result.validation.allPassed) {
        console.error(chalk16.yellow("\n\u26A0\uFE0F  Some validations failed. Review the report for details.\n"));
        process.exit(1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk16.red(`
\u274C Fix run failed: ${msg}
`));
      process.exit(1);
    }
  });
  return cmd;
}
function createPluginsCommand() {
  const cmd = new Command("plugins");
  cmd.description("Plugin management commands");
  const listCmd = new Command("list");
  listCmd.description("List available and loaded plugins").option("--all", "Show all plugins including not-loaded ones", false).option("--json", "Output as JSON", false).action(async (options) => {
    const projectPath = process.cwd();
    const fingerprint = detectProject(projectPath);
    const registry = new PluginRegistry();
    const result = await loadPlugins(registry, {
      projectRoot: projectPath,
      fingerprint,
      enabledPlugins: options.all ? ["next", "vite", "python", "saas", "mcp", "security-basic"] : void 0
    });
    if (options.json) {
      console.log(JSON.stringify({
        loaded: result.loaded,
        skipped: result.skipped,
        errors: result.errors,
        summary: registry.toSummary()
      }, null, 2));
      return;
    }
    console.log(chalk16.bold("\n\u{1F9E9} Turpan Plugins\n"));
    console.log(chalk16.green("\u2713 Loaded plugins:"));
    if (result.loaded.length === 0) {
      console.log(chalk16.dim("  (none \u2014 run with --all to see all built-in plugins)\n"));
    } else {
      for (const id of result.loaded) {
        const plugin = registry.getPlugin(id);
        if (plugin) {
          console.log(`  ${chalk16.cyan(id.padEnd(20))} ${chalk16.dim("v" + plugin.manifest.version)}  ${plugin.manifest.description ?? ""}`);
        }
      }
      console.log();
    }
    if (result.skipped.length > 0) {
      console.log(chalk16.yellow("\u26A0 Skipped plugins:"));
      for (const s of result.skipped) {
        console.log(`  ${chalk16.cyan(s.id.padEnd(20))} ${chalk16.dim(s.reason)}`);
      }
      console.log();
    }
    if (result.errors.length > 0) {
      console.log(chalk16.red("\u2717 Plugin errors:"));
      for (const e of result.errors) {
        console.log(`  ${chalk16.cyan(e.id.padEnd(20))} ${chalk16.red(e.error)}`);
      }
      console.log();
    }
    const summary = registry.toSummary();
    console.log(chalk16.dim("\u2500\u2500\u2500 Summary \u2500\u2500\u2500"));
    console.log(`  Analyzers:     ${chalk16.cyan(summary.analyzerCount)}`);
    console.log(`  Rulesets:     ${chalk16.cyan(summary.rulesetCount)}`);
    console.log(`  Report secs:  ${chalk16.cyan(summary.reportSectionCount)}`);
    console.log(`  Scenarios:    ${chalk16.cyan(summary.scenarioCount)}`);
    console.log(`  Detectors:    ${chalk16.cyan(summary.detectorCount)}`);
    console.log(`  Fixers:       ${chalk16.cyan(summary.fixerCount)}`);
    console.log(`  Commands:     ${chalk16.cyan(summary.commandCount)}`);
    console.log(`  Extra stages: ${chalk16.cyan(summary.stageIds.join(", ") || "(none)")}`);
    console.log();
  });
  const inspectCmd = new Command("inspect");
  inspectCmd.description("Show detailed information about a specific plugin").argument("<plugin-id>", "Plugin ID to inspect (e.g. next, vite, python, saas, mcp, security-basic)").option("--json", "Output as JSON", false).action(async (pluginId, options) => {
    const projectPath = process.cwd();
    const fingerprint = detectProject(projectPath);
    const registry = new PluginRegistry();
    const result = await loadPlugins(registry, {
      projectRoot: projectPath,
      fingerprint,
      enabledPlugins: [pluginId]
    });
    const plugin = registry.getPlugin(pluginId);
    if (options.json) {
      if (plugin) {
        console.log(JSON.stringify({
          manifest: plugin.manifest,
          summary: registry.toSummary(),
          loaded: result.loaded,
          errors: result.errors
        }, null, 2));
      } else {
        console.log(JSON.stringify({ error: `Plugin "${pluginId}" not found`, result }, null, 2));
      }
      return;
    }
    if (!plugin) {
      console.error(chalk16.red(`
\u2717 Plugin "${pluginId}" not found or not applicable to this project.
`));
      const availableBuiltins = ["next", "vite", "python", "saas", "mcp", "security-basic"];
      if (availableBuiltins.includes(pluginId)) {
        console.log(chalk16.dim("  Hint: The plugin may not support this project type based on fingerprint.\n"));
      }
      console.log(chalk16.dim("  Available built-in plugins: " + availableBuiltins.join(", ") + "\n"));
      process.exit(1);
    }
    console.log(chalk16.bold(`
\u{1F9E9} Plugin: ${pluginId}
`));
    console.log(chalk16.dim("\u2500\u2500\u2500 Manifest \u2500\u2500\u2500"));
    console.log(`  Name:         ${chalk16.cyan(plugin.manifest.name)}`);
    console.log(`  Version:      ${chalk16.cyan(plugin.manifest.version)}`);
    console.log(`  ID:           ${chalk16.cyan(plugin.manifest.id)}`);
    console.log(`  Description:  ${plugin.manifest.description ?? chalk16.dim("(none)")}`);
    if (plugin.manifest.dependsOn?.length) {
      console.log(`  Depends on:   ${chalk16.cyan(plugin.manifest.dependsOn.join(", "))}`);
    }
    const analyzers = registry.listAnalyzers().filter((a) => a.pluginId === pluginId);
    if (analyzers.length > 0) {
      console.log(chalk16.dim("\n\u2500\u2500\u2500 Analyzers \u2500\u2500\u2500"));
      for (const a of analyzers) {
        console.log(`  ${chalk16.cyan(a.analyzer.id.padEnd(24))} ${a.analyzer.name}`);
        console.log(`    Categories: ${a.analyzer.categories.join(", ")}`);
      }
    }
    const rulesets = registry.listRulesets().filter((r) => r.pluginId === pluginId);
    if (rulesets.length > 0) {
      console.log(chalk16.dim("\n\u2500\u2500\u2500 Rulesets \u2500\u2500\u2500"));
      for (const r of rulesets) {
        console.log(`  ${chalk16.cyan(r.ruleset.id.padEnd(24))} ${r.ruleset.label}`);
      }
    }
    const scenarios = registry.listScenarios().filter((s) => s.pluginId === pluginId);
    if (scenarios.length > 0) {
      console.log(chalk16.dim("\n\u2500\u2500\u2500 UI Scenarios \u2500\u2500\u2500"));
      for (const s of scenarios) {
        console.log(`  ${chalk16.cyan(s.scenario.id.padEnd(24))} ${s.scenario.label}`);
        console.log(`    Category: ${s.scenario.category}`);
        console.log(`    Steps: ${s.scenario.steps.length}`);
      }
    }
    const commands = registry.listCommands().filter((c) => c.pluginId === pluginId);
    if (commands.length > 0) {
      console.log(chalk16.dim("\n\u2500\u2500\u2500 Commands \u2500\u2500\u2500"));
      for (const c of commands) {
        console.log(`  ${chalk16.cyan(c.command.name.padEnd(24))} ${c.command.description ?? ""}`);
      }
    }
    console.log();
  });
  const trustCmd = new Command("trust");
  trustCmd.description("Trust or revoke an external plugin").argument("<plugin-id>", "Plugin ID to trust or revoke").option("--level <level>", "Trust level: builtin | local-trusted | external-untrusted", "local-trusted").option("--revoke", "Remove this plugin from the trusted database", false).option("--permissions <perms...", "Comma-separated list of granted permissions").option("--notes <notes>", "Optional notes about this trust decision").action(async (pluginId, options) => {
    const projectPath = process.cwd();
    const trustDb = new PluginTrustDb(projectPath);
    if (options.revoke) {
      const success = trustDb.revokeTrust(pluginId);
      if (success) {
        console.log(chalk16.green(`\u2713 Revoked trust for plugin "${pluginId}"`));
      } else {
        console.log(chalk16.yellow(`\u26A0 Plugin "${pluginId}" was not in the trust database`));
      }
      return;
    }
    const level = options.level;
    if (level && !["builtin", "local-trusted", "external-untrusted"].includes(level)) {
      console.error(chalk16.red(`Invalid trust level: "${level}". Use: builtin | local-trusted | external-untrusted`));
      process.exit(1);
    }
    if (DEFAULT_TRUSTED_PLUGINS[pluginId] && !options.revoke) {
      console.log(chalk16.yellow(`\u26A0 Plugin "${pluginId}" is a built-in plugin \u2014 trust is managed by @turpan/core`));
      console.log(chalk16.dim(`  Trust level: ${DEFAULT_TRUSTED_PLUGINS[pluginId].trustLevel}`));
      console.log(chalk16.dim(`  Granted permissions: ${DEFAULT_TRUSTED_PLUGINS[pluginId].grantedPermissions.join(", ")}`));
      return;
    }
    let permissions;
    if (options.permissions) {
      permissions = options.permissions;
      const invalid = permissions.filter((p) => !PLUGIN_PERMISSIONS.includes(p));
      if (invalid.length > 0) {
        console.error(chalk16.red(`Invalid permissions: ${invalid.join(", ")}`));
        console.error(chalk16.dim(`Valid permissions: ${PLUGIN_PERMISSIONS.join(", ")}`));
        process.exit(1);
      }
    } else {
      permissions = ["read-package-metadata", "run-analysis-only"];
      if (level === "local-trusted") {
        permissions = ["read-project-files", "read-package-metadata", "run-analysis-only", "propose-fixes", "ui-scenarios", "read-config"];
      }
    }
    const entry = trustDb.setTrust(
      pluginId,
      level ?? "local-trusted",
      permissions,
      "cli",
      options.notes
    );
    console.log(chalk16.green(`
\u2713 Plugin "${pluginId}" is now trusted
`));
    console.log(`  Trust level:   ${chalk16.cyan(entry.trustLevel)}`);
    console.log(`  Permissions:   ${chalk16.cyan(entry.grantedPermissions.join(", "))}`);
    console.log(`  Trusted since: ${chalk16.dim(entry.trustedSince)}`);
    if (entry.notes) console.log(`  Notes:         ${chalk16.dim(entry.notes)}`);
    console.log();
  });
  const permissionsCmd = new Command("permissions");
  permissionsCmd.description("Show available plugin permissions and their descriptions").option("--json", "Output as JSON", false).action(async (options) => {
    if (options.json) {
      const out = PLUGIN_PERMISSIONS.map((p) => ({
        permission: p,
        description: PERMISSION_DESCRIPTIONS[p]
      }));
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(chalk16.bold("\n\u{1F510} Plugin Permissions\n"));
    console.log(chalk16.dim("Permissions a plugin can request in its manifest:\n"));
    for (const perm of PLUGIN_PERMISSIONS) {
      console.log(`  ${chalk16.cyan(perm.padEnd(24))} ${PERMISSION_DESCRIPTIONS[perm]}`);
    }
    console.log();
  });
  cmd.addCommand(listCmd);
  cmd.addCommand(inspectCmd);
  cmd.addCommand(trustCmd);
  cmd.addCommand(permissionsCmd);
  return cmd;
}
function createScenariosCommand() {
  const cmd = new Command("scenarios");
  cmd.description("UI test scenario management");
  const listCmd = new Command("list");
  listCmd.description("List all available UI test scenarios").option("--json", "Output as JSON", false).action(async (options) => {
    const scenarios = scenarioRegistry.list();
    if (options.json) {
      console.log(JSON.stringify({ scenarios }, null, 2));
      return;
    }
    console.log(chalk16.bold("\n\u{1F3AD} Turpan UI Test Scenarios\n"));
    const grouped = scenarios.reduce((acc, s) => {
      const category = s.id.split("-")[0];
      if (!acc[category]) acc[category] = [];
      acc[category].push(s);
      return acc;
    }, {});
    for (const [category, items] of Object.entries(grouped)) {
      console.log(chalk16.cyan(`  ${category}`));
      for (const s of items) {
        const riskColor = s.riskLevel === "safe" ? chalk16.green : s.riskLevel === "low" ? chalk16.yellow : s.riskLevel === "medium" ? chalk16.red : chalk16.red.bold;
        console.log(chalk16.dim(`    ${s.id.padEnd(25)} ${chalk16.white(s.name.padEnd(25))} Risk: ${riskColor(s.riskLevel.padEnd(6))}`));
      }
      console.log();
    }
    console.log(chalk16.dim(`  Total: ${scenarios.length} scenarios
`));
    console.log(chalk16.dim("  Usage:"));
    console.log(chalk16.dim("    turpan review . --scenarios auth,billing     Run specific scenarios"));
    console.log(chalk16.dim("    turpan review . --ui                         Run all supported scenarios"));
    console.log(chalk16.dim("    turpan scenarios list                         Show all scenarios\n"));
  });
  cmd.addCommand(listCmd);
  const inspectCmd = new Command("inspect");
  inspectCmd.description("Show details about a specific scenario").argument("<scenario-id>", "Scenario ID (e.g. auth, billing, saas-marketing)").action(async (scenarioId) => {
    const scenario = scenarioRegistry.get(scenarioId);
    if (!scenario) {
      console.error(chalk16.red(`
Scenario "${scenarioId}" not found.
`));
      console.log(chalk16.dim("Run `turpan scenarios list` to see available scenarios.\n"));
      process.exit(1);
    }
    console.log(chalk16.bold(`
\u{1F3AD} Scenario: ${scenario.name}
`));
    console.log(chalk16.cyan("  ID:         ") + scenario.id);
    console.log(chalk16.cyan("  Name:       ") + scenario.name);
    console.log(chalk16.cyan("  Risk Level: ") + scenario.riskLevel);
    console.log();
    console.log(chalk16.cyan("  Supports:"));
    console.log(chalk16.dim("    Call with a ProjectFingerprint to determine applicability.\n"));
  });
  cmd.addCommand(inspectCmd);
  const testAuthCmd = new Command("test-auth");
  testAuthCmd.description("Show authenticated SaaS test status and configuration").option("--project <path>", "Project path", ".").option("--json", "Output as JSON", false).action(async (options) => {
    const { resolveProjectPath: resolveProjectPath9, loadConfig: loadConfig3 } = await import('@turpan/shared');
    const { loadConfig: loadCoreConfig } = await import('@turpan/core');
    const projectPath = resolveProjectPath9(options.project ?? ".");
    let cfg;
    try {
      cfg = loadCoreConfig(projectPath);
    } catch {
    }
    const ui = cfg?.["ui"];
    const testUser = ui?.["testUser"];
    const billing = ui?.["billing"];
    const report = {
      projectPath,
      testUser: {
        configured: !!testUser,
        enabled: testUser?.["enabled"] === true,
        email: testUser?.["email"] ?? null,
        loginPath: testUser?.["loginPath"] ?? null,
        dashboardPath: testUser?.["dashboardPath"] ?? null,
        seedCommand: testUser?.["seedCommand"] ? "<set>" : null,
        // SAFETY: NEVER include password
        passwordStored: false
      },
      billing: {
        configured: !!billing,
        testMode: billing?.["testMode"] === true,
        checkoutEndpoint: billing?.["checkoutEndpoint"] ?? null
      },
      scenarios: scenarioRegistry.list().filter((s) => s.id.startsWith("next-saas-")).map((s) => ({ id: s.id, name: s.name, riskLevel: s.riskLevel }))
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(chalk16.bold("\n\u{1F510} Turpan Authenticated SaaS Test Status\n"));
    console.log(chalk16.cyan("  Project:"), projectPath);
    const testUserMode = report.testUser.enabled ? chalk16.green("ENABLED") : chalk16.yellow("DRY-RUN (default)");
    console.log(chalk16.cyan("  testUser:"), testUserMode);
    if (report.testUser.configured) {
      console.log(chalk16.dim(`    email:          ${report.testUser.email ?? "(unset)"}`));
      console.log(chalk16.dim(`    loginPath:      ${report.testUser.loginPath ?? "/login"}`));
      console.log(chalk16.dim(`    dashboardPath:  ${report.testUser.dashboardPath ?? "/dashboard"}`));
      console.log(chalk16.dim(`    seedCommand:    ${report.testUser.seedCommand ?? "(none)"}`));
      console.log(chalk16.dim(`    passwordStored: false (NEVER persisted)`));
    } else {
      console.log(chalk16.dim(`    (no ui.testUser section in turpan.yml)`));
    }
    console.log();
    const billingMode = report.billing.testMode ? chalk16.green("ENABLED") : chalk16.yellow("DISABLED (default)");
    console.log(chalk16.cyan("  billing:"), billingMode);
    if (report.billing.configured) {
      console.log(chalk16.dim(`    checkoutEndpoint: ${report.billing.checkoutEndpoint ?? "/api/test-checkout (auto-detect)"}`));
    } else {
      console.log(chalk16.dim(`    (no ui.billing section in turpan.yml)`));
    }
    console.log();
    console.log(chalk16.cyan("  Authenticated scenarios:"));
    for (const s of report.scenarios) {
      const riskColor = s.riskLevel === "safe" ? chalk16.green : s.riskLevel === "low" ? chalk16.yellow : chalk16.red;
      console.log(chalk16.dim(`    ${s.id.padEnd(45)} Risk: ${riskColor(s.riskLevel)}`));
    }
    console.log();
    if (!report.testUser.enabled) {
      console.log(chalk16.yellow("  To enable real authenticated scenario runs:"));
      console.log(chalk16.dim("    1. Set ui.testUser.enabled: true in turpan.yml"));
      console.log(chalk16.dim("    2. Provide a TEST account (NEVER real user credentials)"));
      console.log(chalk16.dim("    3. Optionally provide a seedCommand to prepare the test user"));
      console.log();
      console.log(chalk16.dim("  See docs/UI_TESTING.md for full configuration and safety properties."));
      console.log();
    } else {
      console.log(chalk16.green("  \u2713 Authenticated scenarios will run with REAL submission"));
      console.log(chalk16.dim("    Run: turpan ui-test " + projectPath + " --scenarios next-saas-auth-good"));
      console.log();
    }
  });
  cmd.addCommand(testAuthCmd);
  return cmd;
}
var __filename$1 = fileURLToPath(import.meta.url);
var __dirname$1 = dirname(__filename$1);
function resolveProjectPath6(input) {
  if (!input) return process.cwd();
  return resolve(process.cwd(), input);
}
function createEvalCommand() {
  const cmd = new Command("eval");
  cmd.description("\u{1F42A} Run Turpan eval suite against fixture projects").argument("[path]", "Project path (default: repo root)", ".").option("--fixture <name>", "Run only this fixture").option("--update", "Update eval.json expectations to match actual results").option("--verbose", "Show full output and all assertion details").option("--quiet", "Show minimal output").option("--hard-fail", "Treat all warnings as errors (CI mode)").option("--report <path>", "Save JSON report to custom path").action(async (path, options) => {
    const projectRoot = resolveProjectPath6(path);
    const repoRoot = join(__dirname$1, "..", "..", "..");
    const evalScript = join(repoRoot, "scripts", "eval.ts");
    if (!existsSync(evalScript)) {
      console.error(`\u2717  Eval script not found at ${evalScript}`);
      console.error("   Make sure you are running from within the Turpan repository.");
      process.exit(1);
    }
    const nodeBin = process.execPath;
    const args = [
      evalScript,
      "--fixture",
      options.fixture,
      options.update && "--update",
      options.verbose && "--verbose",
      options.quiet && "--quiet",
      options.hardFail && "--hard-fail",
      options.report && "--report",
      options.report
    ].filter(Boolean);
    if (options.verbose) {
      console.log(`>>> node ${args.join(" ")}`);
    }
    const result = spawnSync(nodeBin, args, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: "inherit"
    });
    process.exit(result.status ?? 1);
  });
  return cmd;
}
function severityColor(severity) {
  switch (severity) {
    case "critical":
      return chalk16.red.bold;
    case "high":
      return chalk16.red;
    case "medium":
      return chalk16.yellow;
    case "low":
      return chalk16.blue;
    default:
      return chalk16.dim;
  }
}
function printInventory(result) {
  console.log(chalk16.bold("\n\u{1F4E6} Dependency Inventory\n"));
  console.log(
    chalk16.dim(`  Project: ${result.inventory.projectName ?? "unknown"} `) + chalk16.dim(`(${result.inventory.projectType})`)
  );
  console.log(chalk16.dim(`  Total dependencies: ${result.inventory.dependencies.length}`));
  const prod = result.inventory.dependencies.filter((d) => d.type === "prod").length;
  const dev = result.inventory.dependencies.filter((d) => d.type === "dev").length;
  const transitive = result.inventory.dependencies.filter((d) => d.source === "transitive").length;
  console.log();
  console.log(`  ${chalk16.green("prod")}       ${chalk16.bold(prod)}`);
  console.log(`  ${chalk16.blue("dev")}        ${chalk16.bold(dev)}`);
  console.log(`  ${chalk16.dim("transitive")}  ${chalk16.bold(transitive)}`);
}
function printVulnerabilities(result) {
  if (result.vulnerabilities.length === 0) {
    console.log(chalk16.green("\n\u2705 No known vulnerabilities found (offline scan)\n"));
    return;
  }
  console.log(chalk16.bold("\n\u{1F6A8} Vulnerabilities Found\n"));
  const bySev = {
    critical: result.vulnerabilities.filter((v) => v.vulnerability.severity === "critical"),
    high: result.vulnerabilities.filter((v) => v.vulnerability.severity === "high"),
    medium: result.vulnerabilities.filter((v) => v.vulnerability.severity === "medium"),
    low: result.vulnerabilities.filter((v) => v.vulnerability.severity === "low")
  };
  for (const [sev, vulns] of Object.entries(bySev)) {
    if (vulns.length === 0) continue;
    const color = severityColor(sev);
    console.log(chalk16.bold(`  ${sev.toUpperCase()} (${vulns.length})`));
    for (const v of vulns) {
      const tag = v.vulnerability.cveId ? `[${v.vulnerability.cveId}]` : "";
      const exploited = v.vulnerability.exploitedInWild ? chalk16.red(" \u26A0\uFE0F exploited in wild") : "";
      console.log(
        `    ${color("\u25CF")} ${chalk16.bold(v.dependency.name)}@${v.dependency.version} ` + chalk16.dim(`\u2014 ${v.vulnerability.title}${tag}${exploited}`)
      );
    }
    console.log();
  }
}
function printLicenseFindings(result) {
  const violations = result.licenseFindings.filter((l) => l.policyViolation);
  const warnings = result.licenseFindings.filter((l) => !l.policyViolation && l.risk !== "none");
  if (violations.length === 0 && warnings.length === 0) {
    console.log(chalk16.green("  \u2705 No license issues\n"));
    return;
  }
  if (violations.length > 0) {
    console.log(chalk16.red.bold("\n\u26A0\uFE0F  License Policy Violations\n"));
    for (const l of violations) {
      console.log(
        `  ${chalk16.red("\u2717")} ${chalk16.bold(l.dependency.name)} ` + chalk16.dim(`${l.license ?? "(no license)"} \u2014 ${l.reason}`)
      );
    }
  }
  if (warnings.length > 0) {
    console.log(chalk16.yellow.bold("\n\u26A0\uFE0F  License Warnings\n"));
    for (const l of warnings) {
      const icon = l.risk === "high" ? chalk16.red("\u26A0") : chalk16.yellow("\u26A0");
      console.log(
        `  ${icon} ${chalk16.bold(l.dependency.name)} ` + chalk16.dim(`${l.license ?? "(no license)"} \u2014 ${l.reason}`)
      );
    }
  }
  console.log();
}
function printResult(result, verbose = false) {
  printInventory(result);
  if (result.vulnerabilities.length > 0 || result.licenseFindings.some((l) => l.policyViolation)) {
    printVulnerabilities(result);
    printLicenseFindings(result);
  } else if (result.mode === "offline" || result.mode === "online") {
    printVulnerabilities(result);
    printLicenseFindings(result);
  }
  const vulnCount = result.vulnerabilities.length;
  const licCount = result.licenseFindings.filter((l) => l.policyViolation).length;
  const mode = result.mode === "online" ? "online" : "offline";
  if (vulnCount === 0 && licCount === 0) {
    console.log(
      chalk16.green(`
\u2705 Audit clean (${mode} mode, ${result.inventory.dependencies.length} deps scanned)
`)
    );
  } else {
    console.log(
      chalk16.red(`
\u274C Audit found ${vulnCount} vulnerabilities and ${licCount} license violations `) + chalk16.dim(`(${mode} mode)
`)
    );
  }
  if (verbose) {
    if (result.errors.length > 0) {
      console.log(chalk16.yellow("\n  Errors:"));
      for (const e of result.errors) console.log(chalk16.dim(`    ${e}`));
    }
  }
}
function createDependencyAuditCommand() {
  const cmd = new Command("dependency-audit");
  cmd.description("Scan project dependencies for vulnerabilities and license issues").argument("[path]", "Project path to audit", ".").option("--online", "Enable online CVE scanning via OSV/npm audit (explicit opt-in)", false).option("--fail-on-critical", "Exit with error code if critical vulnerabilities found", true).option("--json", "Output results as JSON", false).action(async (path, options) => {
    const projectPath = resolveProjectPath(path);
    const config = loadConfig(projectPath);
    const auditConfig = {
      enabled: true,
      online: options.online ?? false,
      failOnCritical: options.failOnCritical ?? true,
      licensePolicy: {
        disallowed: [],
        warnUnknown: true
      }
    };
    const yamlAudit = config["dependencyAudit"];
    if (yamlAudit) {
      Object.assign(auditConfig, yamlAudit);
      if (options.online !== void 0) auditConfig.online = options.online;
      if (options.failOnCritical !== void 0) auditConfig.failOnCritical = options.failOnCritical;
    }
    console.log(chalk16.bold("\n\u{1F512} Turpan Dependency Audit\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    console.log(chalk16.dim(`Mode: ${auditConfig.online ? chalk16.yellow("ONLINE") : "offline"}`));
    console.log(chalk16.dim(`License policy: disallowed=${auditConfig.licensePolicy.disallowed.join(", ") || "none"}`));
    console.log();
    try {
      const runId = `dep-audit-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
      const result = await runDependencyAudit(projectPath, auditConfig, runId);
      if (options.json) {
        const jsonFriendly = {
          ...result,
          sbomCdx: void 0
          // Keep JSON output compact
        };
        console.log(JSON.stringify(jsonFriendly, null, 2));
        return;
      }
      console.log(chalk16.dim(`  SBOM written to: .turpan/runs/${runId}/sbom.json`));
      console.log(chalk16.dim(`  CycloneDX SBOM:  .turpan/runs/${runId}/sbom.cdx.json`));
      printResult(result, true);
      const hasCritical = result.vulnerabilities.some((v) => v.vulnerability.severity === "critical");
      const hasLicViolation = result.licenseFindings.some((l) => l.policyViolation);
      if (hasCritical && auditConfig.failOnCritical) {
        console.log(chalk16.red("\u274C Critical vulnerabilities found \u2014 failing as requested.\n"));
        process.exit(1);
      }
      if (hasLicViolation) {
        console.log(chalk16.red("\u274C License policy violations found.\n"));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk16.red(`
\u274C Audit failed: ${error}
`));
      process.exit(1);
    }
  });
  return cmd;
}
function createReviewDiffCommand() {
  const cmd = new Command("review-diff");
  cmd.description("Run a diff-scoped review \u2014 analyze only what changed between two refs").argument("[path]", "Project path to review", ".").requiredOption("--base <ref>", "Base ref (branch, tag, commit) to diff from").requiredOption("--target <ref>", "Target ref (branch, tag, commit) to diff to").option("--deep", "Enable deep analysis", false).option("--ui", "Enable UI analysis", false).option("--runtime", "Enable runtime analysis", false).option("--fix", "Enable fix mode", false).option("--plugins <list>", "Comma-separated plugin list", void 0).option("--timeout <seconds>", "Timeout per command", "120").option("--fail-on <level>", "Exit code policy: critical, high, never", "never").action(async (path, options) => {
    const projectPath = resolve(process.cwd(), path);
    const baseRef = options.base;
    const targetRef = options.target;
    const timeoutMs = (parseInt(options.timeout ?? "120") || 120) * 1e3;
    console.log(chalk16.bold("\n\u{1F50D} Turpan Diff Review\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    console.log(chalk16.dim(`Diff: ${baseRef} \u2192 ${targetRef}`));
    console.log(chalk16.cyan("\u23F3 Computing diff\u2026\n"));
    let diffResult;
    try {
      const engine = new GitDiffEngine(projectPath);
      diffResult = engine.getDiff(baseRef, targetRef);
      if (diffResult.refError) {
        console.error(chalk16.red(`
\u274C ${diffResult.refError}
`));
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk16.red(`
\u274C Failed to get git diff: ${err instanceof Error ? err.message : err}
`));
      process.exit(1);
    }
    const s = diffResult.stats;
    console.log(chalk16.green(`  ${s.filesAdded} added | ${s.filesModified} modified | ${s.filesDeleted} deleted | ${s.filesRenamed} renamed`));
    console.log(chalk16.dim(`  +${s.totalLinesAdded} / -${s.totalLinesDeleted} lines
`));
    if (diffResult.hasWorkingTreeChanges) {
      console.log(chalk16.yellow("  \u26A0\uFE0F  Warning: working tree has uncommitted changes\n"));
    }
    if (diffResult.files.length > 0) {
      console.log(chalk16.bold("  Changed files:"));
      for (const f of diffResult.files.slice(0, 30)) {
        const icon = f.changeType === "added" ? "\u2728" : f.changeType === "deleted" ? "\u{1F5D1}\uFE0F" : f.changeType === "renamed" ? "\u{1F4DD}" : "\u{1F4C4}";
        console.log(`    ${icon} ${f.changeType.padEnd(10)} ${f.path}`);
      }
      if (diffResult.files.length > 30) {
        console.log(chalk16.dim(`    \u2026 and ${diffResult.files.length - 30} more files
`));
      }
      console.log();
    }
    console.log(chalk16.cyan("\u23F3 Running diff-scoped analysis\u2026\n"));
    let runPath;
    try {
      runPath = await runAnalysis({
        projectPath,
        deepAnalysis: options.deep ?? false,
        uiAnalysis: options.ui ?? false,
        fixMode: options.fix ?? false,
        timeoutMs,
        skipRuntime: !options.runtime,
        plugins: options.plugins ? options.plugins.split(",").map((p) => p.trim()).filter(Boolean) : void 0,
        diffMode: true,
        diffResult,
        diffBaseRef: baseRef,
        diffTargetRef: targetRef
      });
    } catch (err) {
      console.error(chalk16.red(`
\u274C Diff review failed: ${err instanceof Error ? err.message : err}
`));
      process.exit(1);
    }
    process.stdout.write("\r");
    console.log(chalk16.green("\u2705 Diff review complete!\n"));
    console.log(chalk16.dim(`Reports at: ${runPath}
`));
    console.log(`  ${chalk16.cyan("TURPAN_ANALYSIS.md")}       \u2014 full analysis`);
    console.log(`  ${chalk16.cyan("TURPAN_PR_COMMENT.md")}     \u2014 GitHub PR comment`);
    console.log(`  ${chalk16.cyan("TURPAN_DIFF_FINDINGS.json")} \u2014 CI-friendly JSON
`);
    const failOn = options.failOn ?? "never";
    if (failOn !== "never") {
      const findingsPath = join(runPath, "TURPAN_FINDINGS.json");
      if (existsSync(findingsPath)) {
        try {
          const data = JSON.parse(readFileSync(findingsPath, "utf-8"));
          const findings = data.findings ?? [];
          const critical = findings.filter((f) => f.severity === "critical").length;
          const high = findings.filter((f) => f.severity === "high").length;
          const shouldFail = failOn === "critical" && critical > 0 || failOn === "high" && (critical > 0 || high > 0);
          if (shouldFail) {
            console.log(chalk16.red(`
\u274C Exit policy: --fail-on ${failOn} triggered by ${critical > 0 ? `${critical} critical finding(s)` : `${high} high finding(s)`}
`));
            process.exit(1);
          }
        } catch {
        }
      }
    }
  });
  return cmd;
}

// src/commands/index.ts
init_postPrComment();

// src/shell/intent.ts
var INTENT_PATTERNS = [
  // ── Analysis / Review intents ──────────────────────────────────────────────
  {
    intent: "analyze",
    label: "Analyze",
    patterns: [
      /^(analyze|analysis|audit)$/i,
      /analyze\s+this\s+project/i,
      /deep\s+analysis/i,
      /analyze\s+deeply/i
    ]
  },
  {
    intent: "deep_review",
    label: "Deep Review",
    patterns: [
      /deep\s*review/i,
      /comprehensive\s+review/i,
      /full\s+review/i,
      /thorough\s+review/i,
      /analyze\s+this\s+project\s+deeply/i
    ]
  },
  {
    intent: "quick_review",
    label: "Quick Review",
    patterns: [
      /quick\s*review/i,
      /fast\s+review/i,
      /light\s*review/i,
      /basic\s+review/i
    ]
  },
  {
    intent: "review",
    label: "Review",
    patterns: [
      /^(review|reviewing)$/i,
      /review\s+this/i,
      /run\s+review/i,
      /check\s+the\s+code/i
    ]
  },
  {
    intent: "ui_review",
    label: "UI Review",
    patterns: [
      /ui\s*review/i,
      /visual\s+review/i,
      /ui\s+analysis/i,
      /visual\s+analysis/i,
      /review\s+ui/i
    ]
  },
  {
    intent: "runtime_review",
    label: "Runtime Review",
    patterns: [
      /runtime\s*review/i,
      /runtime\s+analysis/i,
      /runtime\s+test/i,
      /live\s+test/i,
      /run\s+runtime/i
    ]
  },
  {
    intent: "code_quality_review",
    label: "Code Quality Review",
    patterns: [
      /code\s+quality\s+review/i,
      /quality\s+review/i,
      /static\s+analysis/i
    ]
  },
  {
    intent: "cleanup_review",
    label: "Cleanup Review",
    patterns: [
      /cleanup\s*review/i,
      /clean\s+up\s+code/i,
      /clean\s+unused/i,
      /remove\s+unused/i,
      /dead\s+code/i,
      /unused\s+code/i,
      /clean\s+code/i
    ]
  },
  {
    intent: "security_review",
    label: "Security Review",
    patterns: [
      /security\s*review/i,
      /security\s+scan/i,
      /vulnerability\s+scan/i,
      /check\s+security/i,
      /audit\s+security/i
    ]
  },
  {
    intent: "agent_output_audit",
    label: "Agent Output Audit",
    patterns: [
      /agent\s+output\s+audit/i,
      /audit\s+agent\s+output/i,
      /check\s+agent\s+output/i,
      /verify\s+agent/i,
      /agent\s+output/i
    ]
  },
  // ── Test intents ────────────────────────────────────────────────────────────
  {
    intent: "test",
    label: "Test",
    patterns: [
      /^(test|testing|test\s+)$/i,
      /run\s+(unit\s+)?test/i,
      /execute\s+test/i,
      /test\s+this/i
    ]
  },
  {
    intent: "ui",
    label: "UI Test",
    patterns: [
      /^(ui|ui\s+)$/i,
      /live\s+(ui\s+)?test/i,
      /browser\s+test/i,
      /visual\s+test/i,
      /playwright/i
    ]
  },
  // ── Fix intents (specific patterns before generic "fix") ──────────────────
  {
    intent: "patch_only",
    label: "Patch Only",
    patterns: [
      /fix\s+--patch-only/i,
      /patch\s*only/i,
      /plan\s+patch/i,
      /propose\s+fix/i,
      /show\s+fix/i,
      /generate\s+patch/i
    ]
  },
  {
    intent: "apply_fix",
    label: "Apply Fix",
    patterns: [
      /fix\s+--apply/i,
      /apply\s+fix/i,
      /apply\s+patch/i,
      /apply\s+changes/i,
      /fix\s+and\s+apply/i
    ]
  },
  {
    intent: "fix_safe",
    label: "Safe Fix",
    patterns: [
      /fix\s+safe\s+issues?/i,
      /safe\s+fix/i,
      /fix\s+only\s+safe/i
    ]
  },
  {
    intent: "fix",
    label: "Fix",
    patterns: [
      /^(fix)$/i,
      /^fix\s+[a-zA-Z][\w\s]*/i,
      /fix\s+(the\s+)?issues?/i,
      /fix\s+problems/i,
      /improve\s+code\s+quality(?!.*plan)/i
    ]
  },
  // ── Report intents ──────────────────────────────────────────────────────────
  {
    intent: "generate_report",
    label: "Generate Report",
    patterns: [
      /generate\s+(turpan\s+)?analysis/i,
      /generate\s+report/i,
      /create\s+report/i
    ]
  },
  {
    intent: "open_report",
    label: "Open Report",
    patterns: [
      /open\s+report/i,
      /view\s+report/i,
      /show\s+report/i,
      /open\s+analysis/i
    ]
  },
  {
    intent: "show_findings",
    label: "Show Findings",
    patterns: [
      /show\s+findings/i,
      /list\s+findings/i,
      /view\s+findings/i,
      /display\s+findings/i
    ]
  },
  {
    intent: "show_scorecard",
    label: "Show Scorecard",
    patterns: [
      /show\s+scorecard/i,
      /view\s+scorecard/i,
      /display\s+score/i,
      /scorecard/i,
      /score\s+card/i
    ]
  },
  {
    intent: "report",
    label: "Report",
    patterns: [
      /^(report|report\s+)$/i,
      /analysis\s+report/i
    ]
  },
  // ── Legacy / compatibility intents ─────────────────────────────────────────
  {
    intent: "clean",
    label: "Clean",
    patterns: [
      /^(clean|clean\s+)/i,
      /cleanup/i
    ]
  },
  {
    intent: "cleanup-scan",
    label: "Cleanup Scan",
    patterns: [
      /cleanup\s*scan/i
    ]
  },
  {
    intent: "quality",
    label: "Code Quality",
    patterns: [
      /^(quality)$/i
    ]
  },
  {
    intent: "find-unused",
    label: "Find Unused",
    patterns: [
      /find\s+unused/i
    ]
  },
  {
    intent: "detect-fake",
    label: "Detect Fake",
    patterns: [
      /detect\s+fake/i
    ]
  },
  {
    intent: "run",
    label: "Run Command",
    patterns: [
      /^(run|execute)$/i
    ]
  },
  // ── Plugin-based review intents ─────────────────────────────────────────────
  {
    intent: "plugin_review",
    label: "Plugin Review",
    patterns: [
      /use\s+\w+\s+review\s+skills/i,
      /review\s+this\s+as\s+(an?\s+)?(Next\.js|Vite|Python|MCP|SaaS)/i,
      /review\s+as\s+(Next\.js|Vite|Python|MCP|SaaS)/i,
      /review\s+this\s+as\s+(a\s+)?Python(\s+bot)?/i,
      /review\s+this\s+as\s+(a\s+)?MCP\s+server/i,
      /review\s+with\s+(Next\.js|Vite|Python|MCP|SaaS)\s+plugin/i,
      /plugin\s+review/i
    ]
  },
  // ── Meta intents ────────────────────────────────────────────────────────────
  {
    intent: "exit",
    label: "Exit",
    patterns: [
      /^(exit|quit|q|bye|close)$/i
    ]
  }
];
function parseCommand(input) {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);
  const intent = detectIntent(trimmed);
  return {
    intent,
    raw: trimmed,
    args: words.slice(1),
    flags: parseFlags(words)
  };
}
function detectIntent(input) {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return intent;
      }
    }
  }
  return "unknown";
}
function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const flagName = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[flagName] = args[++i];
      } else {
        flags[flagName] = true;
      }
    } else if (arg.startsWith("-")) {
      const flagName = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[flagName] = args[++i];
      } else {
        flags[flagName] = true;
      }
    }
  }
  return flags;
}
function getIntentLabel(intent) {
  const entry = INTENT_PATTERNS.find((p) => p.intent === intent);
  if (entry) return entry.label;
  const labels = {
    analyze: "Analyze",
    review: "Review",
    test: "Test",
    ui: "UI Test",
    clean: "Clean",
    fix: "Fix",
    report: "Report",
    exit: "Exit",
    unknown: "Unknown",
    "cleanup-scan": "Cleanup Scan",
    quality: "Code Quality",
    "find-unused": "Find Unused Code",
    "detect-fake": "Detect Fake Implementation",
    run: "Run Command",
    deep_review: "Deep Review",
    quick_review: "Quick Review",
    ui_review: "UI Review",
    runtime_review: "Runtime Review",
    code_quality_review: "Code Quality Review",
    cleanup_review: "Cleanup Review",
    security_review: "Security Review",
    agent_output_audit: "Agent Output Audit",
    fix_safe: "Safe Fix",
    patch_only: "Patch Only",
    apply_fix: "Apply Fix",
    generate_report: "Generate Report",
    open_report: "Open Report",
    show_findings: "Show Findings",
    show_scorecard: "Show Scorecard"
  };
  return labels[intent] ?? "Unknown";
}
function getCommandCategories() {
  return {
    Analysis: [
      "analyze this project deeply",
      "deep review",
      "quick review"
    ],
    Quality: [
      "code quality review",
      "cleanup review",
      "find unused code",
      "security review",
      "agent output audit"
    ],
    Runtime: [
      "runtime review",
      "run unit tests",
      "run live UI test",
      "ui review"
    ],
    Fix: [
      "improve code quality",
      "fix safe issues",
      "fix --patch-only",
      "fix --apply"
    ],
    Report: [
      "generate Turpan Analysis",
      "open report",
      "show findings",
      "show scorecard"
    ],
    Meta: [
      "exit"
    ]
  };
}

// src/shell/CommandMemory.ts
var DEFAULT_MEMORY = () => ({
  lastRunId: null,
  lastFindings: [],
  lastScorecard: null,
  lastRunMetadata: null,
  projectStarted: false,
  selectedMode: "review",
  commandHistory: [],
  historyIndex: -1,
  historyExhaustedForward: false
});
var CommandMemory = class {
  memory;
  constructor() {
    this.memory = DEFAULT_MEMORY();
  }
  // ── Run memory ─────────────────────────────────────────────────────────────
  get lastRunId() {
    return this.memory.lastRunId;
  }
  setLastRun(id, metadata) {
    this.memory.lastRunId = id;
    if (metadata) {
      this.memory.lastRunMetadata = {
        id,
        timestamp: metadata.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
        projectPath: metadata.projectPath ?? "",
        analysisType: metadata.analysisType ?? "unknown",
        status: metadata.status ?? "completed",
        duration: metadata.duration,
        error: metadata.error
      };
    }
  }
  get lastRunMetadata() {
    return this.memory.lastRunMetadata;
  }
  // ── Findings memory ────────────────────────────────────────────────────────
  setFindings(findings) {
    this.memory.lastFindings = findings;
  }
  get lastFindings() {
    return this.memory.lastFindings;
  }
  setScorecard(scorecard) {
    this.memory.lastScorecard = scorecard;
  }
  get lastScorecard() {
    return this.memory.lastScorecard;
  }
  // ── Project state ──────────────────────────────────────────────────────────
  setProjectStarted(started) {
    this.memory.projectStarted = started;
  }
  get projectStarted() {
    return this.memory.projectStarted;
  }
  // ── Mode ───────────────────────────────────────────────────────────────────
  setMode(mode) {
    this.memory.selectedMode = mode;
  }
  get selectedMode() {
    return this.memory.selectedMode;
  }
  // ── Command history ────────────────────────────────────────────────────────
  pushHistory(command) {
    if (!command.trim()) return;
    if (this.memory.commandHistory[0] === command) return;
    this.memory.commandHistory.unshift(command);
    if (this.memory.commandHistory.length > 100) {
      this.memory.commandHistory.pop();
    }
    this.memory.historyIndex = -1;
    this.memory.historyExhaustedForward = false;
  }
  getHistory() {
    return [...this.memory.commandHistory];
  }
  getPreviousCommand() {
    if (this.memory.commandHistory.length === 0) return null;
    this.memory.historyExhaustedForward = false;
    const nextIndex = this.memory.historyIndex + 1;
    if (nextIndex >= this.memory.commandHistory.length) {
      this.memory.historyIndex = this.memory.commandHistory.length - 1;
      return this.memory.commandHistory[this.memory.commandHistory.length - 1];
    }
    this.memory.historyIndex = nextIndex;
    return this.memory.commandHistory[nextIndex];
  }
  getNextCommand() {
    if (this.memory.commandHistory.length === 0) return null;
    if (this.memory.historyExhaustedForward) return "";
    if (this.memory.historyIndex < 0) {
      this.memory.historyIndex = 0;
      return this.memory.commandHistory[0];
    }
    if (this.memory.historyIndex === 0) {
      this.memory.historyExhaustedForward = true;
      return "";
    }
    this.memory.historyIndex--;
    return this.memory.commandHistory[this.memory.historyIndex];
  }
  resetHistoryIndex() {
    this.memory.historyIndex = -1;
    this.memory.historyExhaustedForward = false;
  }
  // ── Reset ──────────────────────────────────────────────────────────────────
  reset() {
    const prev = this.memory.commandHistory;
    this.memory = DEFAULT_MEMORY();
    this.memory.commandHistory = prev;
    this.memory.historyExhaustedForward = false;
  }
  /**
   * Snapshot of current memory state — useful for debugging.
   */
  toJSON() {
    return {
      lastRunId: this.memory.lastRunId,
      lastFindings: this.memory.lastFindings,
      lastScorecard: this.memory.lastScorecard,
      lastRunMetadata: this.memory.lastRunMetadata,
      projectStarted: this.memory.projectStarted,
      selectedMode: this.memory.selectedMode,
      commandCount: this.memory.commandHistory.length
    };
  }
};
chalk16.dim("\u2500".repeat(44));
var ShellRenderer = class {
  compact;
  constructor(options = {}) {
    this.compact = options.compact ?? false;
  }
  // ── Greeting / Header ──────────────────────────────────────────────────────
  greeting() {
    console.log(chalk16.bold("\n  \u{1F42A}  Turpan Review Shell"));
    console.log(chalk16.dim("  Interactive Review & Fix Agent\n"));
  }
  projectInfo(lines) {
    console.log(chalk16.bold("  \u{1F4C1} Project Detected"));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    for (const line of lines) {
      console.log("  " + line);
    }
    console.log(chalk16.dim("  " + "\u2500".repeat(42) + "\n"));
  }
  help(categories) {
    console.log(chalk16.bold("\n  Available Commands\n"));
    for (const [category, commands] of Object.entries(categories)) {
      console.log(chalk16.cyan(`  ${category}:`));
      for (const cmd of commands) {
        console.log(chalk16.dim(`    \u2022 ${cmd}`));
      }
      console.log();
    }
    console.log(chalk16.dim("  Slash commands: /review  /fix  /report  /open  /doctor\n"));
  }
  status(mode, runId, findingsCount) {
    console.log(chalk16.bold("\n  Status"));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    console.log(`  Mode:        ${chalk16.cyan(mode)}`);
    console.log(`  Last Run:    ${runId ? chalk16.green(runId) : chalk16.dim("none")}`);
    console.log(`  Findings:    ${findingsCount > 0 ? chalk16.yellow(String(findingsCount)) : chalk16.dim("0")}`);
    console.log(chalk16.dim("  " + "\u2500".repeat(42) + "\n"));
  }
  // ── Progress stages ────────────────────────────────────────────────────────
  stageStart(label, description) {
    const icon = chalk16.cyan("\u23F3");
    const text = chalk16.bold(`${icon}  ${label}`);
    const desc = description ? chalk16.dim(` \u2014 ${description}`) : "";
    console.log(text + desc);
  }
  stageComplete(label, durationMs) {
    const icon = chalk16.green("\u2713");
    const text = chalk16.bold(`${icon}  ${label}`);
    const dur = durationMs !== void 0 ? chalk16.dim(` (${durationMs}ms)`) : "";
    console.log(text + dur);
  }
  stageFail(label, error) {
    const icon = chalk16.red("\u2717");
    const text = chalk16.bold(`${icon}  ${label}`);
    const err = error ? chalk16.red(` \u2014 ${error}`) : "";
    console.log(text + err);
  }
  stageSkip(label, reason) {
    const icon = chalk16.dim("\u25CB");
    const text = `${icon}  ${chalk16.dim(label)}`;
    const reasonText = reason ? chalk16.dim(` \u2014 ${reason}`) : "";
    console.log(text + reasonText);
  }
  /**
   * Render a sequence of stages with progress indicators.
   */
  renderStages(stages) {
    if (this.compact) {
      for (const stage of stages) {
        switch (stage.status) {
          case "completed":
            this.stageComplete(stage.label, stage.durationMs);
            break;
          case "failed":
            this.stageFail(stage.label, stage.error);
            break;
          case "skipped":
            this.stageSkip(stage.label);
            break;
          case "running":
            this.stageStart(stage.label);
            break;
          default:
            this.stageSkip(stage.label, "pending");
        }
      }
    } else {
      for (const stage of stages) {
        switch (stage.status) {
          case "completed":
            this.stageComplete(stage.label, stage.durationMs);
            break;
          case "failed":
            this.stageFail(stage.label, stage.error);
            break;
          case "skipped":
            this.stageSkip(stage.label, "skipped by config");
            break;
          case "running":
            this.stageStart(stage.label);
            break;
          default:
            this.stageSkip(stage.label, "not run");
        }
      }
    }
  }
  // ── Summary ────────────────────────────────────────────────────────────────
  runSummary(result) {
    console.log(chalk16.bold("\n  Run Summary"));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    console.log(`  Run ID:      ${chalk16.cyan(result.runId)}`);
    console.log(`  Duration:    ${chalk16.dim(String(result.durationMs) + "ms")}`);
    console.log(`  Findings:    ${result.findingsCount > 0 ? chalk16.yellow(String(result.findingsCount)) : chalk16.green("0")}`);
    console.log(`  Verdict:     ${this.formatVerdict(result.verdict)}`);
    if (result.reportPath) {
      console.log(`  Report:      ${chalk16.dim(result.reportPath)}`);
    }
    console.log(chalk16.dim("  " + "\u2500".repeat(42) + "\n"));
  }
  formatVerdict(verdict) {
    switch (verdict) {
      case "GO":
        return chalk16.green("\u2705 GO");
      case "CONDITIONAL_GO":
        return chalk16.yellow("\u26A0\uFE0F  CONDITIONAL_GO");
      case "NO_GO":
        return chalk16.red("\u274C NO_GO");
      case "INTERNAL_ONLY":
        return chalk16.yellow("\u{1F512} INTERNAL_ONLY");
      default:
        return chalk16.dim(verdict);
    }
  }
  // ── Findings ───────────────────────────────────────────────────────────────
  findingsSummary(findings, limit = 20) {
    if (findings.length === 0) {
      console.log(chalk16.green("\n  \u2705 No findings!\n"));
      return;
    }
    console.log(chalk16.bold(`
  Findings (${findings.length} total)`));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    const sorted = [...findings].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return order[a.severity] - order[b.severity];
    });
    const shown = sorted.slice(0, limit);
    for (const f of shown) {
      this.renderFinding(f);
    }
    if (findings.length > limit) {
      console.log(chalk16.dim(`
  ... and ${findings.length - limit} more.`));
    }
    console.log();
  }
  renderFinding(f) {
    const sev = this.severityIcon(f.severity);
    const title = chalk16.bold(`${sev}  ${f.title}`);
    const location = f.file ? chalk16.dim(` ${f.file}${f.line ? `:${f.line}` : ""}`) : "";
    console.log(`  ${title}${location}`);
    if (!this.compact && f.explanation) {
      const expl = f.explanation.length > 80 ? f.explanation.slice(0, 77) + "..." : f.explanation;
      console.log(chalk16.dim(`    ${expl}`));
    }
  }
  severityIcon(severity) {
    switch (severity) {
      case "critical":
        return chalk16.red("\u{1F525}");
      case "high":
        return chalk16.red("\u2717");
      case "medium":
        return chalk16.yellow("\u26A0");
      case "low":
        return chalk16.blue("\u25CB");
      case "info":
        return chalk16.dim("\xB7");
      default:
        return chalk16.dim("\xB7");
    }
  }
  // ── Scorecard ──────────────────────────────────────────────────────────────
  scorecard(scorecard) {
    console.log(chalk16.bold("\n  Scorecard"));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    console.log(`  Overall:         ${this.scoreColor(scorecard.overall)} ${scorecard.overall}/100`);
    const cats = scorecard.categories;
    console.log(`  Correctness:     ${this.scoreColor(cats.correctness)} ${cats.correctness}/100`);
    console.log(`  Security:        ${this.scoreColor(cats.security)} ${cats.security}/100`);
    console.log(`  Performance:     ${this.scoreColor(cats.performance)} ${cats.performance}/100`);
    console.log(`  Maintainability: ${this.scoreColor(cats.maintainability)} ${cats.maintainability}/100`);
    console.log(`  Code Coverage:   ${this.scoreColor(cats.codeCoverage)} ${cats.codeCoverage}/100`);
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    console.log(`  Critical Issues: ${scorecard.criticalIssues > 0 ? chalk16.red(String(scorecard.criticalIssues)) : chalk16.green("0")}`);
    console.log(`  Total Findings:  ${scorecard.findingsCount}`);
    console.log();
  }
  scoreColor(score) {
    if (score >= 80) return chalk16.green(String(score));
    if (score >= 60) return chalk16.yellow(String(score));
    return chalk16.red(String(score));
  }
  // ── Artifact paths ─────────────────────────────────────────────────────────
  artifactPath(label, path) {
    console.log(`  ${chalk16.cyan("\u2192")} ${chalk16.bold(label)}: ${chalk16.dim(path)}`);
  }
  artifactList(paths) {
    console.log(chalk16.bold("\n  Artifacts"));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
    for (const { label, path } of paths) {
      this.artifactPath(label, path);
    }
    console.log();
  }
  // ── Error / Warning ────────────────────────────────────────────────────────
  error(message) {
    console.error(chalk16.red(`
  Error: ${message}
`));
  }
  warning(message) {
    console.warn(chalk16.yellow(`
  Warning: ${message}
`));
  }
  info(message) {
    console.log(chalk16.cyan(`  \u2139  ${message}`));
  }
  dim(message) {
    console.log(chalk16.dim(`  ${message}`));
  }
  // ── Doctor ─────────────────────────────────────────────────────────────────
  doctorCheck(name, status, details) {
    const icon = status === "pass" ? chalk16.green("\u2713") : status === "warn" ? chalk16.yellow("\u26A0") : chalk16.red("\u2717");
    const detail = details ? chalk16.dim(` \u2014 ${details}`) : "";
    console.log(`  ${icon}  ${name}${detail}`);
  }
  doctorSection(name) {
    console.log(chalk16.bold(`
  ${name}`));
    console.log(chalk16.dim("  " + "\u2500".repeat(42)));
  }
  // ── Prompt ─────────────────────────────────────────────────────────────────
  prompt(label = "turpan") {
    process.stdout.write(chalk16.cyan(label) + chalk16.dim(" > "));
  }
  // ── Exit ───────────────────────────────────────────────────────────────────
  goodbye() {
    console.log(chalk16.dim("\n  \u{1F44B} Goodbye!\n"));
  }
  // ── Safe mode warning ──────────────────────────────────────────────────────
  safeModeNotice() {
    console.log(chalk16.dim("\n  \u2139  Running in safe mode \u2014 no files will be modified."));
    console.log(chalk16.dim('     Use "fix --apply" to apply fixes.\n'));
  }
  patchModeNotice() {
    console.log(chalk16.dim("\n  \u2139  Patch-only mode \u2014 fixes will be proposed but not applied.\n"));
  }
  applyModeNotice() {
    console.log(chalk16.yellow("\n  \u26A0  Apply mode \u2014 fixes will be applied to files.\n"));
  }
};

// src/shell/ShellSession.ts
var ShellSession = class {
  _running = true;
  memory;
  config;
  constructor(config, memory) {
    this.config = config;
    this.memory = memory ?? new CommandMemory();
  }
  // ── Running state ──────────────────────────────────────────────────────────
  get running() {
    return this._running;
  }
  stop() {
    this._running = false;
  }
  // ── Memory delegation ──────────────────────────────────────────────────────
  get commandMemory() {
    return this.memory;
  }
  get lastRunId() {
    return this.memory.lastRunId;
  }
  get lastFindings() {
    return this.memory.lastFindings;
  }
  get lastScorecard() {
    return this.memory.lastScorecard;
  }
  get projectStarted() {
    return this.memory.projectStarted;
  }
  get selectedMode() {
    return this.memory.selectedMode;
  }
  get commandHistory() {
    return this.memory.getHistory();
  }
  // ── Mode helpers ───────────────────────────────────────────────────────────
  /**
   * Map an intent to a shell mode for display / tracking.
   */
  static intentToMode(intent) {
    switch (intent) {
      case "analyze":
      case "deep_review":
        return "analyze";
      case "review":
      case "quick_review":
      case "code_quality_review":
        return "review";
      case "ui":
      case "ui_review":
        return "ui";
      case "runtime_review":
      case "test":
        return "runtime";
      case "security_review":
        return "security";
      case "cleanup_review":
      case "clean":
      case "cleanup-scan":
      case "find-unused":
        return "cleanup";
      case "fix":
      case "fix_safe":
      case "patch_only":
      case "apply_fix":
        return "fix";
      case "report":
      case "generate_report":
      case "open_report":
      case "show_findings":
      case "show_scorecard":
        return "report";
      default:
        return "review";
    }
  }
  // ── History navigation ─────────────────────────────────────────────────────
  pushCommand(command) {
    this.memory.pushHistory(command);
  }
  getPreviousCommand() {
    return this.memory.getPreviousCommand();
  }
  getNextCommand() {
    return this.memory.getNextCommand();
  }
  resetHistoryIndex() {
    this.memory.resetHistoryIndex();
  }
  // ── Mode tracking ──────────────────────────────────────────────────────────
  setMode(mode) {
    this.memory.setMode(mode);
  }
  setProjectStarted(started) {
    this.memory.setProjectStarted(started);
  }
  // ── Session snapshot ───────────────────────────────────────────────────────
  isValid() {
    return this._running;
  }
  summary() {
    return [
      `project: ${this.config.projectName}`,
      `mode: ${this.selectedMode}`,
      `runId: ${this.lastRunId ?? "none"}`,
      `findings: ${this.lastFindings.length}`
    ].join(" | ");
  }
};
var PLUGIN_KEYWORDS = {
  "saas": "saas",
  "saas review": "saas",
  "software as a service": "saas",
  "python": "python",
  "python bot": "python",
  "python-bot": "python",
  "mcp": "mcp",
  "mcp server": "mcp",
  "model context protocol": "mcp",
  "next": "next",
  "next.js": "next",
  "nextjs": "next",
  "vite": "vite",
  "security": "security-basic",
  "security basic": "security-basic",
  "fastapi": "python",
  "telegram": "python",
  "chrome extension": "chrome-extension"
};
function extractPluginsFromCommand(raw) {
  const lower = raw.toLowerCase();
  const plugins = [];
  for (const [keyword, pluginId] of Object.entries(PLUGIN_KEYWORDS)) {
    if (lower.includes(keyword)) {
      if (!plugins.includes(pluginId)) {
        plugins.push(pluginId);
      }
    }
  }
  return plugins;
}
var INTENT_OPTIONS = {
  analyze: { deepAnalysis: true, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  deep_review: { deepAnalysis: true, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  quick_review: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  review: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  ui_review: { deepAnalysis: false, uiAnalysis: true, fixMode: false, skipBuild: false, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  runtime_review: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: false, skipLint: true, skipTypecheck: true, skipSecurity: true },
  code_quality_review: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: false, skipTypecheck: false, skipSecurity: true },
  cleanup_review: { deepAnalysis: true, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  security_review: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: false },
  agent_output_audit: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  test: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: false, skipLint: true, skipTypecheck: true, skipSecurity: true },
  ui: { deepAnalysis: false, uiAnalysis: true, fixMode: false, skipBuild: false, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  fix_safe: { deepAnalysis: false, uiAnalysis: false, fixMode: true, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  patch_only: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  apply_fix: { deepAnalysis: false, uiAnalysis: false, fixMode: true, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  fix: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  // patch-only by default
  generate_report: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  open_report: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  show_findings: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  show_scorecard: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  report: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  "plugin_review": { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false, scenarios: void 0 },
  clean: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  "cleanup-scan": { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  quality: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: false, skipTypecheck: false, skipSecurity: true },
  "find-unused": { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  "detect-fake": { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  run: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: false, skipTests: false, skipLint: false, skipTypecheck: false, skipSecurity: false },
  exit: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true },
  unknown: { deepAnalysis: false, uiAnalysis: false, fixMode: false, skipBuild: true, skipTests: true, skipLint: true, skipTypecheck: true, skipSecurity: true }
};
var INTENT_ACTIONS = {
  analyze: "run",
  deep_review: "run",
  quick_review: "run",
  review: "run",
  ui_review: "run",
  runtime_review: "run",
  code_quality_review: "run",
  cleanup_review: "run",
  security_review: "run",
  agent_output_audit: "run",
  test: "run",
  ui: "run",
  fix_safe: "patch",
  patch_only: "patch",
  apply_fix: "apply",
  fix: "patch",
  // safe default
  generate_report: "report",
  open_report: "open",
  show_findings: "report",
  show_scorecard: "report",
  report: "report",
  "plugin_review": "run",
  // Run review with specific plugins
  clean: "report",
  // scan & propose, never delete
  "cleanup-scan": "report",
  quality: "run",
  "find-unused": "report",
  "detect-fake": "run",
  run: "run",
  exit: "skip",
  unknown: "report"
  // safest default
};
var SCENARIO_KEYWORDS = {
  "marketing": "saas-marketing",
  "homepage": "saas-marketing",
  "auth": "auth",
  "login": "auth",
  "signin": "auth",
  "signup": "auth",
  "registration": "auth",
  "billing": "billing",
  "pricing": "billing",
  "plans": "billing",
  "checkout": "billing",
  "dashboard": "dashboard",
  "admin": "admin",
  "settings": "admin",
  "navigation": "navigation",
  "routing": "navigation",
  "responsive": "responsive",
  "mobile": "responsive"
};
function extractScenariosFromCommand(raw) {
  const lower = raw.toLowerCase();
  const scenarios = [];
  for (const [keyword, scenarioId] of Object.entries(SCENARIO_KEYWORDS)) {
    if (lower.includes(keyword) && !scenarios.includes(scenarioId)) {
      scenarios.push(scenarioId);
    }
  }
  return scenarios;
}
var INTENT_DESCRIPTIONS = {
  analyze: "Full deep analysis of the project",
  deep_review: "Comprehensive multi-stage review",
  quick_review: "Fast review: typecheck + lint only",
  review: "Standard review with build + test",
  ui_review: "UI/visual review with live browser",
  runtime_review: "Runtime behavior analysis",
  code_quality_review: "Static quality and complexity analysis",
  cleanup_review: "Dead code and unused exports scan",
  security_review: "Security vulnerability scan",
  agent_output_audit: "Audit AI agent output quality",
  test: "Run unit tests",
  ui: "Live UI browser test",
  fix_safe: "Fix only safe, auto-fixable issues",
  patch_only: "Propose fixes without applying",
  apply_fix: "Apply fixes to codebase",
  fix: "Propose safe fixes (patch-only)",
  generate_report: "Generate Turpan analysis report",
  open_report: "Open the latest report in browser",
  show_findings: "Show findings from last run",
  show_scorecard: "Show scorecard from last run",
  report: "Generate or show analysis report",
  "plugin_review": "Run review with plugin-specific skills",
  clean: "Scan and propose code cleanup",
  "cleanup-scan": "Scan for cleanup opportunities",
  quality: "Code quality analysis",
  "find-unused": "Find unused code and exports",
  "detect-fake": "Detect fake/mocked implementations",
  run: "Run a custom command",
  exit: "Exit the shell",
  unknown: "Unrecognized command"
};
var IntentRouter = class {
  ctx;
  constructor(ctx) {
    this.ctx = ctx;
  }
  /**
   * Route a parsed command to a workflow.
   */
  route(parsed) {
    const { intent } = parsed;
    const label = getIntentLabel(intent);
    const action = INTENT_ACTIONS[intent] ?? "report";
    const description = INTENT_DESCRIPTIONS[intent] ?? "No description";
    const runOptions = INTENT_OPTIONS[intent] ?? INTENT_OPTIONS.unknown;
    const finalOptions = this.applyFlags(runOptions, parsed.flags, action);
    let plugins;
    if (intent === "plugin_review") {
      plugins = extractPluginsFromCommand(parsed.raw);
      if (plugins.length === 0) {
        plugins = void 0;
      }
    }
    const scenarios = extractScenariosFromCommand(parsed.raw);
    if (intent === "clean" || intent === "cleanup-review") {
      return { intent, label, action: "report", description, runOptions: { ...finalOptions, deepAnalysis: true }, plugins };
    }
    return { intent, label, action, description, runOptions: finalOptions, plugins, scenarios };
  }
  /**
   * Apply explicit flags to override default run options.
   */
  applyFlags(base, flags, action) {
    const result = { ...base };
    if (flags["deep"] === true || flags["deep"] === "true") result.deepAnalysis = true;
    if (flags["ui"] === true || flags["ui"] === "true") result.uiAnalysis = true;
    if (flags["apply"] === true || flags["apply"] === "true") {
      result.fixMode = true;
    }
    if (flags["patch-only"] === true || flags["patch-only"] === "true") {
      result.fixMode = false;
    }
    if (flags["skip-build"] === true || flags["skip-build"] === "true") result.skipBuild = true;
    if (flags["skip-tests"] === true || flags["skip-tests"] === "true") result.skipTests = true;
    return result;
  }
  /**
   * Get the intent description for display.
   */
  describeIntent(intent) {
    return INTENT_DESCRIPTIONS[intent] ?? "Unknown";
  }
  /**
   * Check if an intent requires a prior run.
   */
  requiresPriorRun(intent) {
    return ["show_findings", "show_scorecard", "open_report"].includes(intent);
  }
  /**
   * Get all available intent labels for help display.
   */
  getAllIntents() {
    return Object.entries(INTENT_DESCRIPTIONS).map(([intent, description]) => ({
      intent,
      label: getIntentLabel(intent),
      description,
      action: INTENT_ACTIONS[intent] ?? "report"
    }));
  }
};
function createRouter(projectPath, lastResult) {
  const fingerprint = detectProject(projectPath);
  return new IntentRouter({
    projectPath,
    fingerprint,
    lastResult,
    fixMode: "off"
  });
}
var TURPAN_PROMPT = chalk16.cyan("turpan") + chalk16.dim(" > ");
async function runInteractiveShell(config) {
  const { projectPath } = config;
  const memory = new CommandMemory();
  const renderer = new ShellRenderer();
  const fingerprint = detectProject(projectPath);
  const session = new ShellSession(
    {
      projectPath,
      projectName: fingerprint.name ?? "unknown",
      projectType: fingerprint.framework ?? "unknown"
    },
    memory
  );
  const router = createRouter(projectPath, null);
  renderer.greeting();
  renderer.projectInfo(formatFingerprintSummary(fingerprint).split("\n"));
  renderer.help(getCommandCategories());
  renderer.dim("Type a command or /help for available commands.\n");
  while (session.running) {
    try {
      const { command } = await inquirer.prompt([
        {
          type: "input",
          name: "command",
          message: TURPAN_PROMPT,
          prefix: "",
          transformer: (input) => input
        }
      ]);
      if (!command.trim()) {
        continue;
      }
      if (command.startsWith("/")) {
        await handleSlashCommand(command.slice(1), session, router, renderer);
        continue;
      }
      session.pushCommand(command);
      session.resetHistoryIndex();
      const parsed = parseCommand(command);
      const route = router.route(parsed);
      await executeRoute(route, session, router, renderer);
    } catch (error) {
      if (error.code === "EXIT") {
        session.stop();
      } else {
        renderer.error(String(error));
      }
    }
  }
  renderer.goodbye();
}
async function handleSlashCommand(raw, session, router, renderer) {
  const parsed = parseCommand(raw);
  router.route(parsed);
  switch (raw.toLowerCase()) {
    case "help":
      renderer.help(getCommandCategories());
      return;
    case "status":
      renderer.status(
        session.selectedMode,
        session.lastRunId,
        session.lastFindings.length
      );
      return;
    case "findings":
      if (session.lastFindings.length === 0) {
        renderer.info("No findings from last run. Run a review first.");
      } else {
        renderer.findingsSummary(session.lastFindings);
      }
      return;
    case "score":
    case "scorecard":
      if (!session.lastScorecard) {
        renderer.info("No scorecard from last run. Run a review first.");
      } else {
        renderer.scorecard(session.lastScorecard);
      }
      return;
    case "report":
      await openLatestReport(session, renderer);
      return;
    case "review":
      await executeRoute(router.route(parseCommand("review")), session, router, renderer);
      return;
    case "review --ui":
      await executeRoute(router.route(parseCommand("ui review")), session, router, renderer);
      return;
    case "fix --patch-only":
      await executeRoute(router.route(parseCommand("patch only")), session, router, renderer);
      return;
    case "fix --apply":
      await executeRoute(router.route(parseCommand("apply fix")), session, router, renderer);
      return;
    case "doctor":
      await runDoctor(session, renderer);
      return;
    case "exit":
    case "quit":
      session.stop();
      return;
    default:
      renderer.info(`Unknown slash command: /${raw}. Try /help.`);
  }
}
async function executeRoute(route, session, router, renderer) {
  const { intent, label, action, runOptions, plugins, scenarios } = route;
  if (intent === "exit") {
    session.stop();
    return;
  }
  if (action === "report") {
    if (intent === "show_findings") {
      if (session.lastFindings.length === 0) {
        renderer.info("No findings from last run. Run a review first.");
      } else {
        renderer.findingsSummary(session.lastFindings);
      }
      return;
    }
    if (intent === "show_scorecard") {
      if (!session.lastScorecard) {
        renderer.info("No scorecard from last run. Run a review first.");
      } else {
        renderer.scorecard(session.lastScorecard);
      }
      return;
    }
    if (intent === "open_report" || intent === "open") {
      await openLatestReport(session, renderer);
      return;
    }
    if (router.requiresPriorRun(intent) && !session.lastRunId) {
      renderer.info(`No prior run found. Running a review first...`);
    } else {
      renderer.info(`${label}: ${router.describeIntent(intent)}`);
      renderer.info("(This intent runs a read-only scan)\n");
      return;
    }
  }
  if (action === "open") {
    await openLatestReport(session, renderer);
    return;
  }
  if (action === "patch") {
    renderer.patchModeNotice();
  } else if (action === "apply") {
    renderer.applyModeNotice();
  }
  renderer.stageStart(label, router.describeIntent(intent));
  let result;
  try {
    const config = buildTurpanConfig(session, runOptions ?? {}, plugins, scenarios);
    result = await runReview(config);
    session.commandMemory.setLastRun(result.runId, {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      projectPath: session.config.projectPath,
      analysisType: intent,
      status: "completed",
      duration: result.durationMs
    });
    session.commandMemory.setFindings(result.findings);
    session.commandMemory.setScorecard(result.scorecard);
    session.setProjectStarted(true);
    const mode = ShellSession.intentToMode(intent);
    session.setMode(mode);
    const runPath = getRunReportPath(result.runId);
    renderer.stageComplete(label, result.durationMs);
    renderer.runSummary({
      runId: result.runId,
      durationMs: result.durationMs,
      findingsCount: result.findings.length,
      verdict: result.verdict,
      reportPath: runPath
    });
    if (result.findings.length > 0) {
      renderer.findingsSummary(result.findings, 10);
    }
    renderer.artifactPath("Report", runPath);
  } catch (error) {
    renderer.stageFail(label, error instanceof Error ? error.message : String(error));
    renderer.error(`Review failed: ${error}`);
  }
}
async function runDoctor(session, renderer) {
  renderer.doctorSection("Environment");
  const nodeVersion = process.version;
  renderer.doctorCheck("Node.js", "pass", nodeVersion);
  renderer.doctorCheck("Project Path", "pass", session.config.projectPath);
  if (session.lastRunId) {
    renderer.doctorCheck("Last Run", "pass", session.lastRunId);
  } else {
    renderer.doctorCheck("Last Run", "warn", "No runs yet");
  }
  if (session.lastFindings.length > 0) {
    renderer.doctorCheck(
      "Findings",
      session.lastFindings.some((f) => f.severity === "critical") ? "fail" : "pass",
      `${session.lastFindings.length} findings`
    );
  } else {
    renderer.doctorCheck("Findings", "pass", "No findings");
  }
  if (session.lastScorecard) {
    const score = session.lastScorecard.overall;
    renderer.doctorCheck(
      "Scorecard",
      score >= 60 ? "pass" : score >= 40 ? "warn" : "fail",
      `Overall: ${score}/100`
    );
  } else {
    renderer.doctorCheck("Scorecard", "warn", "No scorecard yet");
  }
  renderer.dim("\n  Run /review for a full analysis.\n");
}
function buildTurpanConfig(session, runOptions, plugins, scenarios) {
  const fingerprint = detectProject(session.config.projectPath);
  return {
    projectPath: session.config.projectPath,
    fingerprint,
    config: {
      version: "1.0.0",
      projectPath: session.config.projectPath,
      runPath: "",
      deepAnalysis: runOptions?.deepAnalysis ?? false,
      uiAnalysis: runOptions?.uiAnalysis ?? false,
      fixMode: runOptions?.fixMode ?? false,
      logLevel: "info",
      plugins: plugins ?? []
    },
    deepAnalysis: runOptions?.deepAnalysis ?? false,
    uiAnalysis: runOptions?.uiAnalysis ?? false,
    fixMode: runOptions?.fixMode ?? false,
    skipBuild: runOptions?.skipBuild ?? false,
    skipTests: runOptions?.skipTests ?? false,
    skipLint: runOptions?.skipLint ?? false,
    skipTypecheck: runOptions?.skipTypecheck ?? false,
    skipSecurity: runOptions?.skipSecurity ?? false,
    plugins,
    uiScenarios: scenarios,
    skipScenarios: false
  };
}
function getRunReportPath(runId) {
  return `.turpan/runs/${runId}/report.html`;
}
async function openLatestReport(session, renderer) {
  if (!session.lastRunId) {
    renderer.info("No report to open. Run a review first.");
    return;
  }
  const reportPath = getRunReportPath(session.lastRunId);
  try {
    await ReportOpenCommand.open(reportPath);
    renderer.info(`Opened: ${reportPath}`);
  } catch {
    renderer.error(`Could not open report: ${reportPath}`);
  }
}
function resolveProjectPath8(input) {
  if (!input) return process.cwd();
  return resolve(process.cwd(), input);
}
function createDefaultConfig2(projectPath) {
  const projectName = projectPath.split("/").pop() || "unknown-project";
  const configPath = join(projectPath, "turpan.yml");
  const config = `# Turpan Configuration \u2014 https://github.com/turpan/turpan

version: 0.1.0
projectPath: ${projectPath}
runPath: ${join(projectPath, ".turpan", "runs")}
deepAnalysis: false
uiAnalysis: false
fixMode: false
logLevel: info

project:
  name: ${projectName}

commands:
  install: ""
  build: ""
  test: ""
  lint: ""
  typecheck: ""
  dev: ""

ui:
  enabled: false
  baseUrl: ""
  scenarios: []
  viewports: [desktop, mobile]

fix:
  mode: report-only
  maxFilesChanged: 5
  allowDependencyChanges: false
  allowFileDeletion: false

security:
  redactSecrets: true

plugins: []

ignore:
  paths: []
  globs: []
`;
  writeFileSync(configPath, config, "utf-8");
}
async function runDoctorCheck2() {
  const checks = [];
  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1).split(".")[0]) >= 20;
  checks.push({ name: "Node.js version", ok: nodeOk, message: nodeOk ? `${nodeVersion} (OK)` : `${nodeVersion} - need v20+` });
  try {
    const pnpmVersion = execSync("pnpm --version", { encoding: "utf-8" }).trim();
    checks.push({ name: "pnpm", ok: true, message: `v${pnpmVersion}` });
  } catch {
    checks.push({ name: "pnpm", ok: false, message: "not found" });
  }
  const cwd = process.cwd();
  try {
    const testFile = join(cwd, `.turpan-doctor-test-${Date.now()}`);
    writeFileSync(testFile, "test");
    unlinkSync(testFile);
    checks.push({ name: "Directory writable", ok: true, message: cwd });
  } catch {
    checks.push({ name: "Directory writable", ok: false, message: `${cwd} - not writable` });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
function shouldFailOn(failOn, critical, high) {
  if (failOn === "never") return false;
  if (failOn === "critical" && critical > 0) return true;
  if (failOn === "high" && (critical > 0 || high > 0)) return true;
  return false;
}
function exitWithPolicy(failOn, critical, high) {
  if (shouldFailOn(failOn, critical, high)) {
    console.log(chalk16.red(`
\u274C Exit policy: --fail-on ${failOn} triggered by ${critical > 0 ? `${critical} critical finding(s)` : `${high} high finding(s)`}
`));
    process.exit(1);
  }
  process.exit(0);
}
async function printTerminalSummary(projectPath, runPath, diffReviewData) {
  const findingsPath = join(runPath, "TURPAN_FINDINGS.json");
  const scorecardPath = join(runPath, "TURPAN_SCORECARD.json");
  const fingerprintPath = join(runPath, "project-fingerprint.json");
  const agentAuditSummaryPath = join(runPath, "agent-audit-summary.json");
  let findings = [];
  let scorecard = { overall: 0, categories: { correctness: 0, security: 0, performance: 0, maintainability: 0, codeCoverage: 0 }, findingsCount: 0, criticalIssues: 0 };
  let fingerprint = {};
  let agentAudit;
  if (existsSync(findingsPath)) {
    try {
      findings = JSON.parse(readFileSync(findingsPath, "utf-8")).findings ?? [];
    } catch {
    }
  }
  if (existsSync(scorecardPath)) {
    try {
      scorecard = JSON.parse(readFileSync(scorecardPath, "utf-8"));
    } catch {
    }
  }
  if (existsSync(fingerprintPath)) {
    try {
      fingerprint = JSON.parse(readFileSync(fingerprintPath, "utf-8"));
    } catch {
    }
  }
  if (existsSync(agentAuditSummaryPath)) {
    try {
      agentAudit = JSON.parse(readFileSync(agentAuditSummaryPath, "utf-8"));
    } catch {
    }
  }
  const runId = runPath.split("/").pop() ?? (/* @__PURE__ */ new Date()).toISOString();
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const analysisData = {
    runId,
    runPath,
    timestamp,
    duration: 0,
    projectPath,
    findings,
    scorecard,
    fingerprint,
    verdict: deriveVerdict(scorecard, findings),
    agentAudit,
    diffReview: diffReviewData
  };
  let reportPaths = null;
  try {
    reportPaths = await generateReports(analysisData);
  } catch (err) {
    console.log(chalk16.dim(`  (report generation: ${err instanceof Error ? err.message : err})
`));
  }
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const verdict = analysisData.verdict;
  const verdictColor = verdict === "GO" ? chalk16.green : verdict === "CONDITIONAL_GO" ? chalk16.yellow : chalk16.red;
  const verdictIcon = verdict === "GO" ? "\u2705" : verdict === "CONDITIONAL_GO" ? "\u26A0\uFE0F" : verdict === "NO_GO" ? "\u274C" : "\u{1F512}";
  console.clear?.();
  console.log(chalk16.bold("\n\u{1F3DB}\uFE0F  Turpan Analysis"));
  console.log(chalk16.dim(`  ${runPath}
`));
  console.log(`  ${verdictIcon} Verdict: ${verdictColor(verdict)}`);
  console.log(`  Overall: ${chalk16.cyan(String(scorecard.overall + "/100"))}`);
  if (critical > 0) console.log(`  \u{1F534} ${chalk16.red(String(critical))} critical   ${chalk16.red(String(high))} high   ${chalk16.yellow(String(medium))} medium`);
  else if (high > 0) console.log(`  \u{1F7E0} ${chalk16.yellow(String(high))} high   ${chalk16.yellow(String(medium))} medium`);
  else if (medium > 0) console.log(`  \u{1F7E1} ${chalk16.yellow(String(medium))} medium`);
  else console.log(`  \u{1F7E2} ${chalk16.green("Clean run \u2014 no findings")}`);
  console.log();
  if (reportPaths) {
    console.log(chalk16.green("\u2705 Turpan Analysis generated:"));
    const artifacts = [
      reportPaths.analysisMd && `  ${chalk16.cyan("TURPAN_ANALYSIS.md")}`,
      reportPaths.analysisHtml && `  ${chalk16.cyan("TURPAN_ANALYSIS.html")}`,
      reportPaths.findingsJson && `  ${chalk16.cyan("TURPAN_FINDINGS.json")}`,
      reportPaths.scorecardJson && `  ${chalk16.cyan("TURPAN_SCORECARD.json")}`,
      reportPaths.fixPlanMd && `  ${chalk16.cyan("TURPAN_FIX_PLAN.md")}`,
      reportPaths.patchDiff && `  ${chalk16.cyan("TURPAN_PATCH.diff")}`,
      reportPaths.runSummary && `  ${chalk16.cyan("TURPAN_RUN_SUMMARY.json")}`,
      reportPaths.evidenceMd && `  ${chalk16.cyan("TURPAN_EVIDENCE_INDEX.md")}`
    ].filter(Boolean);
    for (const a of artifacts) console.log(a);
    console.log();
  }
  console.log(chalk16.dim("  Next:"));
  console.log(`    ${chalk16.cyan("turpan report")}          \u2014 view summary`);
  console.log(`    ${chalk16.cyan("turpan report --open")}    \u2014 open HTML report`);
  console.log(`    ${chalk16.cyan("turpan report --json")}    \u2014 JSON for CI / agents`);
  console.log(`    ${chalk16.cyan("turpan report --format html")} \u2014 HTML report`);
  console.log();
  return { critical, high, medium, verdict };
}
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
function createDoctorCommand2() {
  const cmd = new Command("doctor");
  cmd.description("Check system requirements and environment").action(async () => {
    console.log(chalk16.bold("\n\u{1F50D} Turpan Environment Check\n"));
    const result = await runDoctorCheck2();
    for (const check of result.checks) {
      const icon = check.ok ? chalk16.green("\u2713") : chalk16.red("\u2717");
      console.log(`${icon} ${check.name}: ${check.message} ${chalk16.dim(`[${check.ok ? "OK" : "FAIL"}]`)}`);
    }
    console.log();
    if (result.ok) {
      console.log(chalk16.green("\u2705 All checks passed! Turpan is ready to use.\n"));
    } else {
      console.log(chalk16.red("\u274C Some checks failed. Please fix the issues above.\n"));
      process.exit(1);
    }
  });
  return cmd;
}
function createInitCommand2() {
  const cmd = new Command("init");
  cmd.description("Initialize Turpan configuration in a project").argument("[path]", "Project path", ".").action(async (path) => {
    const projectPath = resolveProjectPath8(path);
    console.log(chalk16.bold("\n\u{1F680} Initializing Turpan\n"));
    console.log(chalk16.dim(`Project: ${projectPath}
`));
    createDefaultConfig2(projectPath);
    console.log(chalk16.green("\u2705 Created turpan.yml\n"));
    console.log(chalk16.bold("Next steps:"));
    console.log(`  ${chalk16.cyan("turpan review .")}`);
    console.log(`  ${chalk16.cyan("turpan")}
`);
  });
  return cmd;
}
function createReviewCommand2() {
  const cmd = new Command("review");
  cmd.description("Run code review on a project").argument("[path]", "Project path to analyze", ".").option("-d, --deep", "Enable deep analysis (includes static quality, dead code, security checks)", false).option("-q, --quality", "Run static code quality analyzers only (unused deps, placeholders, complexity, architecture)", false).option("-u, --ui", "Enable UI analysis", false).option("-f, --fix", "Enable fix mode (produces patch plans only, same as --patch-only)", false).option("--patch-only", "Generate patch diffs without applying (default when using --fix)", false).option("--apply", "Apply fixes to working tree (requires clean git state)", false).option("--interactive", "Ask before applying each fix", false).option("--auto-safe", "Automatically apply only safe fix categories", false).option("-p, --plan", "Print the review plan without running analysis", false).option("--install", "Run dependency installation before review", false).option("--timeout <seconds>", "Timeout per command in seconds (default: 120)", "120").option("--skip-build", "Skip build stage", false).option("--skip-tests", "Skip test stage", false).option("--skip-lint", "Skip lint stage", false).option("--skip-typecheck", "Skip typecheck stage", false).option("-s, --scenarios <ids>", "Comma-separated UI test scenario IDs (e.g. auth,billing,dashboard)", void 0).option("--skip-scenarios", "Skip scenario library execution in UI tests", false).option("--plugins <list>", "Comma-separated list of plugins to enable (e.g. saas,security-basic)", void 0).option("--agent-output", "Run agent output audit (requires --task)", false).option("--task <file>", "Task/prompt file for agent audit").option("--from <ref>", "Base ref for diff-based review (e.g. main, origin/main)", void 0).option("--to <ref>", "Target ref for diff-based review (e.g. HEAD, feature-branch)", void 0).option("--fail-on <level>", "Exit code policy: critical (exit 1 on critical), high (exit 1 on critical or high), never (never fail)", "never").option("--dependency-audit", "Include dependency CVE scan and license audit (offline by default)", false).option("--online", "Enable online CVE scanning (OSV/npm audit) \u2014 only used with --dependency-audit", false).action(async (path, options) => {
    const projectPath = resolveProjectPath8(path);
    const timeoutMs = (parseInt(options.timeout ?? "120") || 120) * 1e3;
    if (options.from || options.to) {
      const baseRef = options.from ?? "main";
      const targetRef = options.to ?? "HEAD";
      console.log(chalk16.bold("\n\u{1F50D} Turpan Diff Review\n"));
      console.log(chalk16.dim(`Project: ${projectPath}`));
      console.log(chalk16.dim(`Diff: ${baseRef} \u2192 ${targetRef}`));
      console.log(chalk16.cyan("\u23F3 Computing diff\u2026\n"));
      const { GitDiffEngine: GitDiffEngine2 } = await import('@turpan/git-diff');
      let diffResult;
      try {
        const engine = new GitDiffEngine2(projectPath);
        diffResult = engine.getDiff(baseRef, targetRef);
        if (diffResult.refError) {
          console.error(chalk16.red(`
\u274C ${diffResult.refError}
`));
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk16.red(`
\u274C Failed to get git diff: ${err instanceof Error ? err.message : err}
`));
        process.exit(1);
      }
      const s = diffResult.stats;
      console.log(chalk16.green(`  ${s.filesAdded} added | ${s.filesModified} modified | ${s.filesDeleted} deleted | ${s.filesRenamed} renamed`));
      console.log(chalk16.dim(`  +${s.totalLinesAdded} / -${s.totalLinesDeleted} lines
`));
      if (diffResult.hasWorkingTreeChanges) {
        console.log(chalk16.yellow("  \u26A0\uFE0F  Warning: working tree has uncommitted changes\n"));
      }
      if (diffResult.files.length > 0) {
        console.log(chalk16.bold("  Changed files:"));
        for (const f of diffResult.files.slice(0, 30)) {
          const icon = f.changeType === "added" ? "\u2728" : f.changeType === "deleted" ? "\u{1F5D1}\uFE0F" : f.changeType === "renamed" ? "\u{1F4DD}" : "\u{1F4C4}";
          console.log(`    ${icon} ${f.changeType.padEnd(10)} ${f.path}`);
        }
        if (diffResult.files.length > 30) {
          console.log(chalk16.dim(`    \u2026 and ${diffResult.files.length - 30} more files
`));
        }
        console.log();
      }
      console.log(chalk16.cyan("\u23F3 Running diff-scoped analysis\u2026\n"));
      let runPath2;
      try {
        runPath2 = await runAnalysis({
          projectPath,
          deepAnalysis: options.deep ?? false,
          uiAnalysis: options.ui ?? false,
          fixMode: options.fix ?? false,
          install: options.install ?? false,
          timeoutMs,
          skipBuild: options.skipBuild ?? false,
          skipTests: options.skipTests ?? false,
          skipLint: options.skipLint ?? false,
          skipTypecheck: options.skipTypecheck ?? false,
          uiScenarios: options.scenarios ? options.scenarios.split(",").map((s2) => s2.trim()).filter(Boolean) : void 0,
          skipScenarios: options.skipScenarios ?? false,
          plugins: options.plugins ? options.plugins.split(",").map((p) => p.trim()).filter(Boolean) : void 0,
          dependencyAudit: options.dependencyAudit ?? false,
          dependencyAuditOnline: options.online ?? false,
          diffMode: true,
          diffResult,
          diffBaseRef: baseRef,
          diffTargetRef: targetRef
        });
      } catch (err) {
        console.error(chalk16.red(`
\u274C Diff review failed: ${err instanceof Error ? err.message : err}
`));
        process.exit(1);
      }
      const { GitDiffEngine: GE2 } = await import('@turpan/git-diff');
      const engine2 = new GitDiffEngine2(projectPath);
      const recommendation = engine2.deriveRecommendation(diffResult);
      const diffReviewData = {
        baseRef,
        targetRef,
        changedFilesSummary: `${s.filesAdded} added, ${s.filesModified} modified, ${s.filesDeleted} deleted, ${s.filesRenamed} renamed (+${s.totalLinesAdded}/-${s.totalLinesDeleted} lines)`,
        riskByFile: diffResult.riskLevel.files.map((f) => ({
          file: f,
          risk: diffResult.riskLevel.level,
          reason: diffResult.riskLevel.reasons.find((r) => r.includes(f))
        })),
        changedRoutes: diffResult.changedRoutes.map((r) => r.route),
        changedApis: diffResult.changedApis.map((a) => a.path),
        changedComponents: diffResult.changedComponents.map((c) => c.name),
        findingsIntroducedByDiff: recommendation.findings.map((f) => `[${f.severity}] ${f.title}`),
        preExistingFindingsIgnored: [],
        recommendation: recommendation.decision,
        confidence: recommendation.confidence,
        summary: recommendation.summary,
        topIntroducedRisks: recommendation.findings.slice(0, 5).map((f) => ({
          severity: f.severity,
          title: f.title,
          explanation: f.explanation,
          file: f.file,
          line: f.line,
          confidence: 80
        })),
        testCoverage: {
          status: "not-applicable",
          criticalFeaturesTested: false,
          testFilesChanged: diffResult.stats.filesDeleted + diffResult.stats.filesAdded,
          sourceFilesChanged: diffResult.stats.totalFiles,
          missingTestFiles: [],
          deletedTestFiles: diffResult.stats.filesDeleted > 0 ? diffResult.files.filter((f) => f.changeType === "deleted" && (f.path.includes("test") || f.path.includes("spec"))).map((f) => f.path) : [],
          testsWithoutAssertions: []
        },
        mergeDecision: {
          decision: recommendation.decision,
          blockers: recommendation.decision === "block_merge" ? recommendation.findings.filter((f) => f.severity === "critical").map((f) => f.title) : [],
          warnings: recommendation.decision === "request_changes" ? recommendation.findings.filter((f) => f.severity === "high").map((f) => f.title) : []
        }
      };
      console.clear();
      console.log(chalk16.green("\u2705 Diff review complete!\n"));
      const recIcon = recommendation.decision === "approve" ? "\u2705" : recommendation.decision === "request_changes" ? "\u26A0\uFE0F" : "\u274C";
      console.log(`  PR Decision: ${recIcon} **${recommendation.decision.replace("_", " ").toUpperCase()}**
`);
      console.log(chalk16.dim(`Reports at: ${runPath2}
`));
      console.log(`  ${chalk16.cyan("TURPAN_ANALYSIS.md")}       \u2014 full analysis`);
      console.log(`  ${chalk16.cyan("TURPAN_PR_COMMENT.md")}     \u2014 GitHub PR comment`);
      console.log(`  ${chalk16.cyan("TURPAN_DIFF_FINDINGS.json")} \u2014 CI-friendly JSON
`);
      const failOn2 = options.failOn ?? "never";
      const summary2 = await printTerminalSummary(projectPath, runPath2, diffReviewData);
      exitWithPolicy(failOn2, summary2.critical, summary2.high);
      return;
    }
    const fixMode = resolveFixMode({
      patchOnly: options.patchOnly,
      apply: options.apply,
      interactive: options.interactive,
      autoSafe: options.autoSafe,
      fix: options.fix
    });
    if (fixMode !== "report-only") {
      try {
        const result = await runFixEngine({
          projectRoot: projectPath,
          fixMode,
          runReviewFirst: true,
          reviewOptions: { deep: options.deep, timeoutMs }
        });
        const verdictColor = result.validation.allPassed ? chalk16.green : chalk16.red;
        console.log(chalk16.bold("\n\u2705 Fix run complete!"));
        console.log(chalk16.dim(`   Mode: ${fixMode} | Applied: ${result.applied.length} | Rejected: ${result.rejected.length}
`));
      } catch (err) {
        console.error(chalk16.red(`
\u274C Fix run failed: ${err}
`));
        process.exit(1);
      }
      return;
    }
    if (options.agentOutput) {
      const taskFile2 = options.task ?? join(projectPath, ".turpan", "task.md");
      let taskText;
      if (existsSync(taskFile2)) {
        taskText = readFileSync(taskFile2, "utf-8");
      }
      console.log(chalk16.cyan("\n\u{1F50D} Running agent output audit\u2026\n"));
      const report = await runAgentOutputAudit({ projectRoot: projectPath, taskText, agentType: options.agent });
      console.log(chalk16.green(`
\u2705 Agent audit complete \u2014 Score: ${report.completion.overall}/100 (${report.recommendation})
`));
      return;
    }
    const modeParts = options.quality ? ["static-code-quality"] : [options.deep ? "deep" : "standard"];
    if (options.ui) modeParts.push("UI");
    if (options.fix) modeParts.push("fix");
    if (options.install) modeParts.push("+install");
    const skipped = [
      options.skipBuild && "build",
      options.skipTests && "tests",
      options.skipLint && "lint",
      options.skipTypecheck && "typecheck"
    ].filter(Boolean);
    if (skipped.length > 0) modeParts.push(`-skip:${skipped.join(",")}`);
    console.log(chalk16.bold("\n\u{1F50D} Turpan Review\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    console.log(chalk16.dim(`Mode: ${modeParts.join(" | ")}`));
    if (options.timeout) console.log(chalk16.dim(`Timeout: ${options.timeout}s per command`));
    console.log();
    console.log(chalk16.cyan("\u23F3 Analyzing..."));
    let runPath;
    try {
      if (options.quality) {
        runPath = await runAnalysis({
          projectPath,
          deepAnalysis: true,
          uiAnalysis: false,
          fixMode: options.fix ?? false,
          install: false,
          timeoutMs,
          skipBuild: true,
          skipTests: true,
          skipLint: true,
          skipTypecheck: true,
          skipSecurity: true,
          uiScenarios: options.scenarios ? options.scenarios.split(",").map((s) => s.trim()).filter(Boolean) : void 0,
          skipScenarios: true
        });
      } else {
        const enabledPlugins = options.plugins ? options.plugins.split(",").map((p) => p.trim()).filter(Boolean) : void 0;
        runPath = await runAnalysis({
          projectPath,
          deepAnalysis: options.deep ?? false,
          uiAnalysis: options.ui ?? false,
          fixMode: options.fix ?? false,
          install: options.install ?? false,
          timeoutMs,
          skipBuild: options.skipBuild ?? false,
          skipTests: options.skipTests ?? false,
          skipLint: options.skipLint ?? false,
          skipTypecheck: options.skipTypecheck ?? false,
          uiScenarios: options.scenarios ? options.scenarios.split(",").map((s) => s.trim()).filter(Boolean) : void 0,
          skipScenarios: options.skipScenarios ?? false,
          plugins: enabledPlugins,
          dependencyAudit: options.dependencyAudit ?? false,
          dependencyAuditOnline: options.online ?? false
        });
      }
    } catch (error) {
      console.error(chalk16.red(`
\u274C Analysis failed: ${error}
`));
      process.exit(1);
    }
    const taskFile = options.task ?? join(projectPath, ".turpan", "task.md");
    if (existsSync(taskFile)) {
      console.log(chalk16.cyan("\n\u{1F50D} Running agent output audit\u2026\n"));
      const auditReport = await runAgentOutputAudit({
        projectRoot: projectPath,
        taskText: readFileSync(taskFile, "utf-8")
      });
      const summaryPath = join(runPath, "agent-audit-summary.json");
      writeFileSync(summaryPath, JSON.stringify({
        completionScore: auditReport.completion.overall,
        recommendation: auditReport.recommendation,
        confidenceLevel: auditReport.confidenceLevel,
        requestedCapabilities: auditReport.requestedCapabilities.map((c) => c.category),
        implementedCapabilities: auditReport.implementedCapabilities.map((c) => c.category),
        missingCapabilities: auditReport.completion.missingCapabilities.map((c) => c.category),
        fakeShallowImpls: auditReport.completion.fakeOrShallowCapabilities.map((c) => c.category),
        issuesCount: {
          critical: auditReport.issues.filter((i) => i.severity === "critical").length,
          high: auditReport.issues.filter((i) => i.severity === "high").length,
          medium: auditReport.issues.filter((i) => i.severity === "medium").length,
          low: auditReport.issues.filter((i) => i.severity === "low").length
        },
        overall: auditReport.completion.overall
      }, null, 2), "utf-8");
      const detailPath = join(runPath, "AGENT_OUTPUT_AUDIT.json");
      writeFileSync(detailPath, JSON.stringify(auditReport, null, 2), "utf-8");
      console.log(chalk16.green(`  Agent audit \u2014 Score: ${auditReport.completion.overall}/100 (${auditReport.recommendation})
`));
    }
    const summary = await printTerminalSummary(projectPath, runPath);
    const failOn = options.failOn ?? "never";
    exitWithPolicy(failOn, summary.critical, summary.high);
  });
  return cmd;
}
function createReportCommand2() {
  const cmd = new Command("report");
  cmd.description("Display, open, or export the Turpan Analysis report").argument("[path]", "Project path or run ID (default: latest run)", ".").option("--format <format>", "Output format: markdown (default) or html", "markdown").option("--json", "Output structured JSON (findings + scorecard)", false).option("--open", "Open the HTML report in the browser", false).action(async (path, options) => {
    const { ReportOpenCommand: ReportOpenCommand2 } = await import('@turpan/report');
    const projectPath = resolveProjectPath8(path);
    if (options.open) {
      await ReportOpenCommand2.open();
      return;
    }
    if (options.json) {
      const latestPath2 = join(projectPath, ".turpan", "runs", "latest");
      const findingsPath = join(latestPath2, "TURPAN_FINDINGS.json");
      const scorecardPath = join(latestPath2, "TURPAN_SCORECARD.json");
      const summaryPath = join(latestPath2, "TURPAN_RUN_SUMMARY.json");
      if (existsSync(findingsPath)) {
        console.log(readFileSync(findingsPath, "utf-8"));
      } else if (existsSync(scorecardPath)) {
        console.log(readFileSync(scorecardPath, "utf-8"));
      } else if (existsSync(summaryPath)) {
        console.log(readFileSync(summaryPath, "utf-8"));
      } else {
        console.error(chalk16.red("\n\u274C No JSON report found. Run `turpan review .` first.\n"));
        process.exit(1);
      }
      return;
    }
    const latestPath = join(projectPath, ".turpan", "runs", "latest");
    const htmlPath = join(latestPath, "TURPAN_ANALYSIS.html");
    const mdPath = join(latestPath, "TURPAN_ANALYSIS.md");
    const reportPath = options.format === "html" ? htmlPath : mdPath;
    if (!existsSync(reportPath)) {
      console.log(chalk16.yellow("\n\u26A0 No analysis report found.\n"));
      console.log(chalk16.dim("Run " + chalk16.cyan("turpan review .") + " first.\n"));
      return;
    }
    const content = readFileSync(reportPath, "utf-8");
    console.log(content);
  });
  const openCmd = new Command("open");
  openCmd.description("Open the HTML report in your browser").action(async () => {
    const { ReportOpenCommand: ReportOpenCommand2 } = await import('@turpan/report');
    await ReportOpenCommand2.open();
  });
  cmd.addCommand(openCmd);
  return cmd;
}
function createInspectCommand2() {
  const cmd = new Command("inspect");
  cmd.description("Inspect and display project fingerprint").argument("[path]", "Project path to inspect", ".").option("--json", "Output as JSON", false).action(async (path, options) => {
    const projectPath = resolveProjectPath8(path);
    console.log(chalk16.bold("\n\u{1F50D} Project Fingerprint\n"));
    console.log(chalk16.dim(`Inspecting: ${projectPath}
`));
    try {
      const { detectProject: detectProject7, formatFingerprintSummary: formatFingerprintSummary4 } = await import('@turpan/core');
      const fingerprint = detectProject7(projectPath);
      if (options.json) {
        console.log(JSON.stringify(fingerprint, null, 2));
      } else {
        const summary = formatFingerprintSummary4(fingerprint);
        console.log(chalk16.bold("\u{1F4CB} Project Summary"));
        console.log(chalk16.dim("\u2500".repeat(50)));
        console.log(summary.split("\n").map((l) => "  " + l).join("\n"));
        console.log(chalk16.dim("\u2500".repeat(50) + "\n"));
        if (fingerprint.missingFiles.length > 0) {
          console.log(chalk16.bold("\u26A0\uFE0F  Missing / Potential Issues"));
          for (const missing of fingerprint.missingFiles) {
            console.log(`  ${chalk16.yellow("\u2022")} ${missing}`);
          }
          console.log();
        }
      }
      const latestPath = join(projectPath, ".turpan", "runs", "latest");
      ensureDir(latestPath);
      writeFileSync(join(latestPath, "project-fingerprint.json"), JSON.stringify(fingerprint, null, 2), "utf-8");
      console.log(chalk16.dim(`Fingerprint saved to: ${latestPath}/project-fingerprint.json
`));
    } catch (error) {
      console.error(chalk16.red(`
\u274C Inspection failed: ${error}
`));
      process.exit(1);
    }
  });
  return cmd;
}
var program = new Command();
program.name("turpan").description("\u{1F42A} Interactive review and fix agent CLI").version("0.1.0");
function createCleanupScanCommand() {
  const cmd = new Command("cleanup-scan");
  cmd.description("Scan for cleanup candidates (unused code, placeholders, dead code) \u2014 read-only").argument("[path]", "Project path to scan", ".").option("--deep", "Run deep analysis including architecture checks", false).action(async (path, options) => {
    const projectPath = resolveProjectPath8(path);
    console.log(chalk16.bold("\n\u{1F9F9} Turpan Cleanup Scan\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    console.log(chalk16.dim("Mode: read-only \u2014 no files will be deleted\n"));
    console.log(chalk16.cyan("\u{1F50D} Scanning...\n"));
    try {
      const runPath = await runAnalysis({
        projectPath,
        deepAnalysis: options.deep ?? false,
        skipBuild: true,
        skipTests: true,
        skipLint: true,
        skipTypecheck: true,
        skipSecurity: true
      });
      console.log("\x1B[2J\x1B[0f");
      console.log(chalk16.green("\u2705 Cleanup scan complete!\n"));
      console.log(chalk16.dim(`Reports at: ${runPath}
`));
      console.log(`  ${chalk16.cyan("TURPAN_ANALYSIS.md")} \u2014 contains Code Quality & Cleanup section`);
      console.log(`  ${chalk16.cyan("TURPAN_FINDINGS.json")}
`);
    } catch (error) {
      console.log("\x1B[2J\x1B[0f");
      console.error(chalk16.red(`
\u274C Cleanup scan failed: ${error}
`));
      process.exit(1);
    }
  });
  return cmd;
}
function createAgentAuditCommand() {
  const cmd = new Command("agent-audit");
  cmd.description("Audit agent output: compare original task to actual implementation").argument("[path]", "Project path to audit", ".").option("-t, --task <file>", "Path to task/prompt file that was given to the agent").option("--agent <type>", "Agent type (claude-code, opencode, cursor, etc.)").option("--shell", "Read task from interactive shell input").option("--from <ref>", "Base ref for diff-scoped audit (e.g. main)", void 0).option("--to <ref>", "Target ref for diff-scoped audit (e.g. HEAD)", void 0).action(async (path, options) => {
    const projectPath = resolveProjectPath8(path);
    console.log(chalk16.bold("\n\u{1F916} Turpan Agent Output Audit\n"));
    console.log(chalk16.dim(`Project: ${projectPath}
`));
    let taskText;
    if (options.shell) {
      console.log(chalk16.dim("Paste the task/prompt (Ctrl+D to finish):\n"));
      taskText = await new Promise((resolve6) => {
        const chunks = [];
        process.stdin.on("data", (d) => chunks.push(d.toString()));
        process.stdin.on("end", () => resolve6(chunks.join("")));
      });
    } else if (options.task) {
      const taskPath = resolve(projectPath, options.task);
      if (!existsSync(taskPath)) {
        console.error(chalk16.red(`
\u274C Task file not found: ${taskPath}
`));
        process.exit(1);
      }
      taskText = readFileSync(taskPath, "utf-8");
      console.log(chalk16.dim(`Task loaded from: ${taskPath}
`));
    } else {
      const defaultPath = join(projectPath, ".turpan", "task.md");
      if (existsSync(defaultPath)) {
        taskText = readFileSync(defaultPath, "utf-8");
        console.log(chalk16.dim(`Task loaded from: ${defaultPath}
`));
      } else {
        console.error(chalk16.red("\n\u274C No task file specified. Use --task <file> or create .turpan/task.md\n"));
        process.exit(1);
      }
    }
    console.log(chalk16.cyan("\u{1F50D} Analyzing agent output\u2026\n"));
    let diffResultForAudit;
    if (options.from || options.to) {
      const baseRef = options.from ?? "main";
      const targetRef = options.to ?? "HEAD";
      try {
        const { GitDiffEngine: GitDiffEngine2 } = await import('@turpan/git-diff');
        const engine = new GitDiffEngine2(projectPath);
        const diff = engine.getDiff(baseRef, targetRef);
        if (!diff.refError) {
          diffResultForAudit = { files: diff.files };
          console.log(chalk16.dim(`Diff scope: ${baseRef} \u2192 ${targetRef} (${diff.files.length} files)
`));
        }
      } catch {
      }
    }
    try {
      const report = await runAgentOutputAudit({
        projectRoot: projectPath,
        taskText,
        agentType: options.agent,
        diffMode: Boolean(diffResultForAudit),
        diffResult: diffResultForAudit
      });
      const verdictColor = report.recommendation === "READY" ? chalk16.green : report.recommendation === "READY_WITH_LIMITATIONS" ? chalk16.yellow : report.recommendation === "NOT_READY" ? chalk16.red : chalk16.red.bold;
      console.log(chalk16.bold("\u{1F4CA} Agent Output Audit Results\n"));
      console.log(`  Recommendation: ${verdictColor(report.recommendation)}`);
      console.log(`  Confidence:     ${report.confidenceLevel}`);
      console.log(`  Overall Score:  ${chalk16.cyan(String(report.completion.overall) + "/100")}`);
      console.log();
      console.log(`  Requested:     ${chalk16.cyan(String(report.completion.totalCapabilities))} capabilities`);
      console.log(`  Implemented:   ${chalk16.green(String(report.completion.implementedCapabilities))}`);
      console.log(`  Missing:       ${report.completion.missingCapabilities.length > 0 ? chalk16.red(String(report.completion.missingCapabilities.length)) : chalk16.green("0")}`);
      console.log();
      const critical = report.issues.filter((i) => i.severity === "critical").length;
      const high = report.issues.filter((i) => i.severity === "high").length;
      const medium = report.issues.filter((i) => i.severity === "medium").length;
      const low = report.issues.filter((i) => i.severity === "low").length;
      if (report.issues.length > 0) {
        console.log(chalk16.bold("  Issues Found:"));
        if (critical > 0) console.log(`    ${chalk16.red("\u25CF")} ${chalk16.red(String(critical))} critical`);
        if (high > 0) console.log(`    ${chalk16.red("\u25CF")} ${chalk16.yellow(String(high))} high`);
        if (medium > 0) console.log(`    ${chalk16.yellow("\u25CF")} ${chalk16.yellow(String(medium))} medium`);
        if (low > 0) console.log(`    ${chalk16.blue("\u25CF")} ${chalk16.blue(String(low))} low`);
        console.log();
      }
      console.log(`  ${chalk16.bold("Coverage:")}`);
      console.log(`    Feature Coverage:     ${chalk16.cyan(String(report.completion.requestedFeatureCoverage) + "%")}`);
      console.log(`    Implementation Depth: ${chalk16.cyan(String(report.completion.implementationDepth) + "%")}`);
      console.log(`    Test Relevance:      ${chalk16.cyan(String(report.completion.testCoverageRelevance) + "%")}`);
      console.log(`    Runtime Validation:   ${chalk16.cyan(String(report.completion.runtimeValidation) + "%")}`);
      console.log();
      if (report.issues.length > 0) {
        console.log(chalk16.bold("  Issues:\n"));
        for (const issue of report.issues.slice(0, 20)) {
          const sevColor = issue.severity === "critical" || issue.severity === "high" ? chalk16.red : issue.severity === "medium" ? chalk16.yellow : chalk16.dim;
          const kindLabel = `[${issue.kind}]`.padEnd(22);
          console.log(`    ${sevColor(issue.severity.toUpperCase().padEnd(10))} ${kindLabel} ${issue.title}`);
          if (issue.file) {
            console.log(chalk16.dim(`      ${issue.file}${issue.line ? ":" + issue.line : ""}`));
          }
        }
        if (report.issues.length > 20) {
          console.log(chalk16.dim(`    \u2026 and ${report.issues.length - 20} more issues
`));
        }
        console.log();
      }
      console.log(`  ${chalk16.bold("Summary:")} ${report.summary}
`);
      const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const runDir = join(projectPath, ".turpan", "runs", runId);
      ensureDir(runDir);
      const reportJson = JSON.stringify(report, null, 2);
      writeFileSync(join(runDir, "AGENT_OUTPUT_AUDIT.json"), reportJson, "utf-8");
      const mdLines = [];
      mdLines.push("# Agent Output Audit Report");
      mdLines.push("");
      mdLines.push(`**Project:** ${projectPath}`);
      mdLines.push(`**Date:** ${(/* @__PURE__ */ new Date()).toISOString()}`);
      mdLines.push(`**Recommendation:** ${report.recommendation}`);
      mdLines.push(`**Confidence:** ${report.confidenceLevel}`);
      mdLines.push("");
      mdLines.push("## Completion Score");
      mdLines.push("");
      mdLines.push(`| Metric | Value |`);
      mdLines.push(`|--------|-------|`);
      mdLines.push(`| **Overall** | **${report.completion.overall}/100** |`);
      mdLines.push(`| Feature Coverage | ${report.completion.requestedFeatureCoverage}% |`);
      mdLines.push(`| Implementation Depth | ${report.completion.implementationDepth}% |`);
      mdLines.push(`| Test Relevance | ${report.completion.testCoverageRelevance}% |`);
      mdLines.push(`| Runtime Validation | ${report.completion.runtimeValidation}% |`);
      mdLines.push(`| Requested Capabilities | ${report.completion.totalCapabilities} |`);
      mdLines.push(`| Implemented | ${report.completion.implementedCapabilities} |`);
      mdLines.push(`| Missing | ${report.completion.missingCapabilities.length} |`);
      mdLines.push("");
      mdLines.push("## Requested vs Implemented");
      mdLines.push("");
      mdLines.push("| Capability | Status |");
      mdLines.push("|------------|--------|");
      for (const cap of report.requestedCapabilities) {
        const impl = report.implementedCapabilities.find((i) => i.category === cap.category);
        const status = impl ? "\u2705 Implemented" : "\u274C Missing";
        mdLines.push(`| ${cap.category} | ${status} |`);
      }
      mdLines.push("");
      if (report.issues.length > 0) {
        mdLines.push("## Issues");
        mdLines.push("");
        for (const issue of report.issues) {
          mdLines.push(`### ${issue.severity.toUpperCase()}: ${issue.title}`);
          mdLines.push("");
          mdLines.push(`${issue.explanation}`);
          mdLines.push("");
          if (issue.file) {
            mdLines.push(`**File:** \`${issue.file}${issue.line ? ":" + issue.line : ""}\``);
            mdLines.push("");
          }
          if (issue.suggestedFix) {
            mdLines.push(`**Suggested Fix:** ${issue.suggestedFix}`);
            mdLines.push("");
          }
        }
      }
      mdLines.push("");
      mdLines.push(`## Summary`);
      mdLines.push("");
      mdLines.push(report.summary);
      mdLines.push("");
      mdLines.push("*Generated by Turpan Agent Output Audit*");
      writeFileSync(join(runDir, "AGENT_OUTPUT_AUDIT.md"), mdLines.join("\n"), "utf-8");
      console.log(chalk16.green("\u2705 Agent audit complete!\n"));
      console.log(chalk16.dim(`Report saved to: ${runDir}
`));
      console.log(`  ${chalk16.cyan("AGENT_OUTPUT_AUDIT.md")} \u2014 human-readable report`);
      console.log(`  ${chalk16.cyan("AGENT_OUTPUT_AUDIT.json")} \u2014 structured data
`);
    } catch (error) {
      console.error(chalk16.red(`
\u274C Agent audit failed: ${error}
`));
      process.exit(1);
    }
  });
  return cmd;
}
function createUiTestCommand() {
  const cmd = new Command("ui-test");
  cmd.description("Run live UI testing engine \u2014 start dev server, open browser, test routes").argument("[path]", "Project path to test", ".").option("--url <url>", "Skip server start, use existing URL (e.g. http://localhost:3000)").option("--headed", "Run with visible browser (not headless)", false).option("--mobile", "Only test mobile viewport (390\xD7844)", false).option("--desktop", "Only test desktop viewport (1280\xD7800)", false).option("--trace", "Capture Playwright traces for debugging", false).option("-s, --scenarios <ids>", "Comma-separated scenario IDs (e.g. auth,billing,marketing)", void 0).option("--skip-scenarios", "Skip scenario library", false).action(async (path, options) => {
    const projectPath = resolveProjectPath8(path);
    const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    console.log(chalk16.bold("\n\u{1F5A5}\uFE0F  Turpan Live UI Test\n"));
    console.log(chalk16.dim(`Project: ${projectPath}`));
    if (options.url) console.log(chalk16.dim(`URL: ${options.url}`));
    console.log(chalk16.dim(`Mode: ${options.headed ? "headed" : "headless"} | ${options.mobile ? "mobile" : options.desktop ? "desktop" : "both"} viewports
`));
    console.log(chalk16.cyan("\u23F3 Starting UI test engine...\n"));
    try {
      const fingerprint = detectProject(projectPath);
      const cfg = loadConfig(projectPath);
      const testUser = cfg.ui?.testUser;
      const billing = cfg.ui?.billing;
      const report = await runUiTest({
        projectRoot: projectPath,
        runId,
        fingerprint,
        url: options.url,
        headed: options.headed,
        mobileOnly: options.mobile,
        scenarios: options.scenarios ? options.scenarios.split(",").map((s) => s.trim()).filter(Boolean) : void 0,
        skipScenarios: options.skipScenarios ?? false,
        desktopOnly: options.desktop,
        trace: options.trace,
        testUser: testUser?.enabled ? {
          enabled: true,
          email: testUser.email,
          password: testUser.password,
          seedCommand: testUser.seedCommand ?? "",
          loginPath: testUser.loginPath ?? "/login",
          dashboardPath: testUser.dashboardPath ?? "/dashboard"
        } : void 0,
        billing: billing?.testMode ? {
          testMode: true,
          checkoutEndpoint: billing.checkoutEndpoint ?? ""
        } : void 0
      });
      console.log("\x1B[2J\x1B[0f");
      console.log(chalk16.bold("\n\u{1F5A5}\uFE0F  UI Test Results\n"));
      const verdictColor = report.verdict === "usable" ? chalk16.green : report.verdict === "partially_usable" ? chalk16.yellow : chalk16.red;
      console.log(`  Verdict: ${verdictColor(report.verdict.toUpperCase())}`);
      console.log(chalk16.dim(`  App: ${report.appType} @ ${report.baseUrl}
`));
      console.log(`  Routes:     ${report.summary.successfulRoutes}/${report.summary.totalRoutes} loaded`);
      console.log(`  Screenshots: ${chalk16.cyan(String(report.summary.totalScreenshots))}`);
      console.log(`  Console errors: ${report.summary.consoleErrors > 0 ? chalk16.red(String(report.summary.consoleErrors)) : chalk16.green("0")}`);
      console.log(`  Network errors: ${report.summary.networkErrors > 0 ? chalk16.red(String(report.summary.networkErrors)) : chalk16.green("0")}`);
      console.log(`  Hydration errors: ${report.summary.hydrationErrors > 0 ? chalk16.red(String(report.summary.hydrationErrors)) : chalk16.green("0")}`);
      console.log(`  Responsive issues: ${report.summary.responsiveIssues > 0 ? chalk16.yellow(String(report.summary.responsiveIssues)) : chalk16.green("0")}`);
      console.log(`  A11y issues: ${report.summary.a11yIssues > 0 ? chalk16.yellow(String(report.summary.a11yIssues)) : chalk16.green("0")}`);
      console.log(`  Interactions: ${report.summary.interactionSteps - report.summary.interactionFailures}/${report.summary.interactionSteps} succeeded
`);
      if (report.findings.length > 0) {
        console.log(chalk16.bold("  UI Findings:"));
        for (const f of report.findings.slice(0, 10)) {
          const sevColor = f.severity === "critical" || f.severity === "high" ? chalk16.red : f.severity === "medium" ? chalk16.yellow : chalk16.dim;
          console.log(`    ${sevColor(`[${f.severity}]`)} ${f.title}`);
        }
        if (report.findings.length > 10) {
          console.log(chalk16.dim(`    \u2026 and ${report.findings.length - 10} more
`));
        }
      }
      const runDir = join(projectPath, ".turpan", "runs", runId);
      console.log(chalk16.green("\n\u2705 UI test complete!\n"));
      console.log(chalk16.dim(`Artifacts at: ${runDir}
`));
      console.log(`  ${chalk16.cyan("screenshots/")}   \u2014 page screenshots`);
      console.log(`  ${chalk16.cyan("ui/routes.json")}   \u2014 discovered routes`);
      console.log(`  ${chalk16.cyan("ui/console-errors.json")} \u2014 console errors`);
      console.log(`  ${chalk16.cyan("ui/network-errors.json")} \u2013 network errors`);
      console.log(`  ${chalk16.cyan("ui-test-report.json")} \u2013 full report
`);
    } catch (error) {
      console.log("\x1B[2J\x1B[0f");
      console.error(chalk16.red(`
\u274C UI test failed: ${error}
`));
      process.exit(1);
    }
  });
  return cmd;
}
program.addCommand(createDoctorCommand2());
program.addCommand(createInitCommand2());
program.addCommand(createInspectCommand2());
program.addCommand(createReviewCommand2());
program.addCommand(createReportCommand2());
program.addCommand(createDependencyAuditCommand());
program.addCommand(createCleanupScanCommand());
program.addCommand(createAgentAuditCommand());
program.addCommand(createReviewDiffCommand());
program.addCommand(createUiTestCommand());
program.addCommand(createRuntimeTestCommand());
program.addCommand(createFixCommand());
program.addCommand(createPluginsCommand());
program.addCommand(createScenariosCommand());
program.addCommand(createEvalCommand());
var scriptsCmd = new Command("scripts");
scriptsCmd.description("\u{1F42A} Turpan utility scripts");
scriptsCmd.command("post-pr-comment").description("Post or update a sticky PR comment with Turpan review results").allowUnknownOption(true).action(async () => {
  const { createPostPrCommentCommand: createPostPrCommentCommand2 } = await Promise.resolve().then(() => (init_postPrComment(), postPrComment_exports));
  const subCmd = createPostPrCommentCommand2();
  await subCmd.parseAsync(process.argv, { from: "user" });
});
program.addCommand(scriptsCmd);
var mcpCmd = new Command("mcp");
mcpCmd.description("\u{1F42A} Turpan MCP Server commands");
mcpCmd.command("serve").description("Start the Turpan MCP server (stdio transport)").allowUnknownOption(true).action(async () => {
  await runMcpCommand(["serve", ...process.argv.slice(3)]);
});
mcpCmd.command("config").description("Show MCP server configuration").allowUnknownOption(true).action(async () => {
  await runMcpCommand(["config", ...process.argv.slice(3)]);
});
mcpCmd.command("status").description("Check MCP server status").allowUnknownOption(true).action(async () => {
  await runMcpCommand(["status", ...process.argv.slice(3)]);
});
program.addCommand(mcpCmd);
program.action(async () => {
  if (process.argv.length >= 3 && process.argv[2] === "mcp") {
    await runMcpCommand(["--help"]);
    return;
  }
  await runInteractiveShell({ projectPath: resolveProjectPath8(".") });
});
program.parseAsync(process.argv).catch((error) => {
  console.error(chalk16.red(`
\u274C Error: ${error.message}
`));
  console.error(error.stack);
  process.exit(1);
});
