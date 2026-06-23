// src/GitDiffEngine.ts
import { execFileSync } from "child_process";
function execGit(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", timeout: 3e4 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`git ${args.join(" ")} failed: ${msg}`);
  }
}
function isGitRepo(cwd) {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf-8", timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
function refExists(cwd, ref) {
  try {
    execGit(cwd, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}
function getRepoRoot(cwd) {
  return execGit(cwd, ["rev-parse", "--show-toplevel"]).trim();
}
function parseStatusFlag(flag) {
  return { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied" }[flag[0]] ?? "modified";
}
function parseNumstatLine(line) {
  const parts = line.split("	");
  if (parts.length < 3) return null;
  const [added, deleted, ...rest] = parts;
  const path = rest.join("	");
  if (added === "-" && deleted === "-") return { path, linesAdded: 0, linesDeleted: 0, binary: true };
  return { path, linesAdded: parseInt(added, 10) || 0, linesDeleted: parseInt(deleted, 10) || 0, binary: false };
}
var OWNERSHIP_PATTERNS = [
  { pattern: /\.(tsx?|jsx?|vue|svelte)$/, ownership: "frontend", confidence: 85 },
  { pattern: /\/components?\//i, ownership: "frontend", confidence: 90 },
  { pattern: /\/pages?\//i, ownership: "frontend", confidence: 90 },
  { pattern: /\/routes?\//i, ownership: "frontend", confidence: 85 },
  { pattern: /\/views?\//i, ownership: "frontend", confidence: 80 },
  { pattern: /\/ui\//i, ownership: "frontend", confidence: 85 },
  { pattern: /\.(py|go|rs|java|kt|scala)$/, ownership: "backend", confidence: 85 },
  { pattern: /\/api\//i, ownership: "backend", confidence: 85 },
  { pattern: /\/handlers?\//i, ownership: "backend", confidence: 85 },
  { pattern: /\/services?\//i, ownership: "backend", confidence: 80 },
  { pattern: /\/controllers?\//i, ownership: "backend", confidence: 90 },
  { pattern: /\/models?\//i, ownership: "backend", confidence: 75 },
  { pattern: /\/routes?\//i, ownership: "backend", confidence: 80 },
  { pattern: /\/middleware\//i, ownership: "backend", confidence: 90 },
  { pattern: /\/shared\//i, ownership: "shared", confidence: 95 },
  { pattern: /\/common\//i, ownership: "shared", confidence: 85 },
  { pattern: /\/lib\//i, ownership: "shared", confidence: 70 },
  { pattern: /\/utils?\//i, ownership: "shared", confidence: 75 },
  { pattern: /\.(json|yaml|yml|toml|ini|env|cfg|conf)$/, ownership: "config", confidence: 90 },
  { pattern: /\/config\//i, ownership: "config", confidence: 95 },
  { pattern: /^Makefile$/, ownership: "config", confidence: 90 },
  { pattern: /\/scripts\//i, ownership: "config", confidence: 70 },
  { pattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/, ownership: "test", confidence: 95 },
  { pattern: /\/tests?\//i, ownership: "test", confidence: 90 },
  { pattern: /\/__tests?__\//i, ownership: "test", confidence: 95 },
  { pattern: /\/mocks?\//i, ownership: "test", confidence: 90 },
  { pattern: /\/fixtures?\//i, ownership: "test", confidence: 85 },
  { pattern: /\.(md|txt|rst)$/, ownership: "docs", confidence: 85 },
  { pattern: /\/docs?\//i, ownership: "docs", confidence: 90 },
  { pattern: /\/docker/i, ownership: "infra", confidence: 95 },
  { pattern: /\/k8s|\/kubernetes/i, ownership: "infra", confidence: 95 },
  { pattern: /\/terraform|\.tf$/i, ownership: "infra", confidence: 95 },
  { pattern: /\/github\/workflows?\//i, ownership: "infra", confidence: 95 }
];
function detectOwnership(filePath) {
  const name = filePath.toLowerCase();
  let best = { file: filePath, ownership: "unknown", confidence: 40 };
  for (const { pattern, ownership, confidence } of OWNERSHIP_PATTERNS) {
    if (pattern.test(name) && confidence > best.confidence) {
      best = { file: filePath, ownership, confidence };
    }
  }
  return best;
}
var CRITICAL_PATTERNS = [
  /\bpassword\s*=/i,
  /\bsecret\s*=/i,
  /\bapi[_-]?key\s*=/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /\bchild_process\b/i,
  /process\.env\.[A-Z]/,
  /\.env(?:\.local|\.development)?/i,
  /auth bypass/i,
  /SQL injection/i,
  /hard[_-]?coded[_-]?credential/i,
  /\badmin\s*:\s*true\b/i,
  /\broot\s*:\s*true\b/i,
  /--allow-unauthenticated/i,
  /skip.*auth/i
];
var HIGH_RISK_PATTERNS = [
  /dangerouslySetInnerHTML\b/,
  /\beval\s*\(/i,
  /shell\s*:\s*true/i,
  /appendFile\(|writeFile\(/i
];
function assessRisk(files, hunks) {
  const reasons = [];
  const riskyFiles = [];
  const secretFiles = files.filter((f) => /\bsecret|\bpassword|\bcredential|\benv|\bauth/i.test(f.path) && (f.changeType === "added" || f.changeType === "modified"));
  if (secretFiles.length > 0) {
    reasons.push("Secret/credential files modified");
    riskyFiles.push(...secretFiles.map((f) => f.path));
  }
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type !== "added") continue;
      const c = line.content;
      for (const p of CRITICAL_PATTERNS) {
        if (p.test(c)) {
          reasons.push(`Critical: ${p.source}`);
          if (!riskyFiles.includes(hunk.filePath)) riskyFiles.push(hunk.filePath);
        }
      }
      for (const p of HIGH_RISK_PATTERNS) {
        if (p.test(c)) {
          reasons.push(`High-risk: ${p.source}`);
          if (!riskyFiles.includes(hunk.filePath)) riskyFiles.push(hunk.filePath);
        }
      }
    }
  }
  const deletedAuth = files.filter((f) => (f.path.includes("auth") || f.path.includes("permission")) && f.changeType === "deleted");
  if (deletedAuth.length > 0) {
    reasons.push("Auth/permission files deleted");
    riskyFiles.push(...deletedAuth.map((f) => f.path));
  }
  const total = files.reduce((s, f) => s + f.linesAdded + f.linesDeleted, 0);
  if (total > 2e3) reasons.push(`Large diff: ${total} line changes`);
  let level = "low";
  if (reasons.some((r) => r.includes("Critical"))) level = "critical";
  else if (reasons.some((r) => r.includes("Auth/permission"))) level = "high";
  else if (reasons.some((r) => r.includes("High-risk"))) level = "high";
  else if (reasons.length > 0) level = "medium";
  return { level, reasons, files: [...new Set(riskyFiles)] };
}
function isPathAffectedByDiff(diff, filePath) {
  return diff.files.some((f) => f.path === filePath || f.oldPath === filePath || filePath.endsWith(f.path) || f.path.endsWith(filePath));
}
function computeDiffRecommendation(diff, additionalFindings) {
  const findings = [];
  const reasons = [];
  if (diff.riskLevel.level === "critical") {
    findings.push({ id: "risk-critical", severity: "critical", category: "security", title: "Critical security risks detected in diff", explanation: diff.riskLevel.reasons.join("; "), introducedBy: "modified" });
    reasons.push(...diff.riskLevel.reasons);
  } else if (diff.riskLevel.level === "high") {
    findings.push({ id: "risk-high", severity: "high", category: "security", title: "High-risk patterns detected in diff", explanation: diff.riskLevel.reasons.join("; "), introducedBy: "modified" });
    reasons.push(...diff.riskLevel.reasons);
  }
  const introducedFindings = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of additionalFindings ?? []) {
    introducedFindings[f.severity]++;
    if (f.severity === "critical") {
      findings.push({ id: `diff-${f.id}`, severity: "critical", category: "security", title: f.title, explanation: "", introducedBy: "modified" });
    } else if (f.severity === "high") {
      findings.push({ id: `diff-${f.id}`, severity: "high", category: "security", title: f.title, explanation: "", introducedBy: "modified" });
    }
  }
  const deletedTests = diff.files.filter((f) => f.changeType === "deleted" && (f.path.includes("test") || f.path.includes("spec")));
  if (deletedTests.length > 0) {
    findings.push({ id: "tests-deleted", severity: "high", category: "testing", title: "Test files deleted", explanation: `Deleted: ${deletedTests.map((f) => f.path).join(", ")}`, introducedBy: "deleted" });
    reasons.push("Test files were deleted");
  }
  const addedTests = diff.files.filter((f) => f.changeType === "added" && (f.path.includes("test") || f.path.includes("spec")));
  if (addedTests.length > 0 && diff.stats.totalFiles > 5) reasons.push(`Added ${addedTests.length} test file(s)`);
  const featureFiles = diff.files.filter((f) => f.changeType !== "deleted" && !f.path.includes("test") && !f.path.includes("spec") && !f.path.includes(".md") && !f.path.includes("package.json"));
  const hasTestChange = diff.files.some((f) => f.path.includes("test") || f.path.includes("spec") || f.path.includes(".test.") || f.path.includes(".spec."));
  const riskyFeatureNoTest = featureFiles.length > 3 && !hasTestChange;
  if (riskyFeatureNoTest) {
    findings.push({ id: "no-test-coverage", severity: "medium", category: "testing", title: "Feature changes with no test coverage", explanation: `${featureFiles.length} files changed but no test files modified`, introducedBy: "modified" });
    reasons.push("Feature changes lack test coverage");
  }
  if (diff.stats.totalFiles > 30) reasons.push(`Large PR: ${diff.stats.totalFiles} files changed`);
  const unknownFiles = diff.files.filter((f) => diff.ownership.some((o) => o.file === f.path && o.ownership === "unknown"));
  if (unknownFiles.length > 0) reasons.push(`${unknownFiles.length} file(s) with unknown ownership`);
  let decision = "approve";
  if (findings.some((f) => f.severity === "critical") || diff.riskLevel.level === "critical") {
    decision = "block_merge";
  } else if (introducedFindings.high > 0 || riskyFeatureNoTest || diff.riskLevel.level === "medium" && !hasTestChange) {
    decision = "request_changes";
  }
  let confidence = "high";
  if (diff.refError || diff.stats.totalFiles > 100) confidence = "low";
  else if (diff.stats.totalFiles >= 30) confidence = "medium";
  const categoryCounts = {};
  for (const f of findings) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
  }
  const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, n]) => `${n} ${cat}`).join(", ");
  let summary;
  if (decision === "block_merge") {
    summary = `Diff blocked: critical issues detected${topCategories ? ` (${topCategories})` : ""}.`;
  } else if (decision === "request_changes") {
    summary = `Diff requests changes: ${findings.length} finding(s)${topCategories ? ` across ${topCategories}` : ""}.`;
  } else {
    summary = "Diff looks clean with no blocking issues.";
  }
  return { decision, confidence, summary, reasons, findings };
}
var GitDiffEngine = class {
  constructor(cwd) {
    this.cwd = cwd;
    if (!isGitRepo(cwd)) throw new Error(`Not a git repository: ${cwd}`);
  }
  cwd;
  getDiff(baseRef, targetRef) {
    const root = getRepoRoot(this.cwd);
    const baseExists = refExists(root, baseRef);
    const targetExists = refExists(root, targetRef);
    let refError;
    if (!baseExists && !targetExists) refError = `Neither '${baseRef}' nor '${targetRef}' found in repository`;
    else if (!baseExists) refError = `Base ref '${baseRef}' not found`;
    else if (!targetExists) refError = `Target ref '${targetRef}' not found`;
    let numstatOutput = "";
    if (baseExists && targetExists) {
      try {
        numstatOutput = execGit(root, ["diff", "--numstat", `${baseRef}..${targetRef}`]);
      } catch {
        refError = `Could not diff ${baseRef}..${targetRef}`;
      }
      if (refError) numstatOutput = "";
    }
    const files = [];
    if (baseExists && targetExists) {
      try {
        const nameStatus = execGit(root, ["diff", "--name-status", `${baseRef}..${targetRef}`]);
        for (const line of nameStatus.trim().split("\n").filter(Boolean)) {
          const parts = line.split("	");
          if (parts.length < 2) continue;
          const rawPath = parts[1];
          const numstat = parseNumstatLine(numstatOutput.split("\n").find((l) => l.includes(rawPath)) ?? "");
          files.push({ path: rawPath, changeType: parseStatusFlag(parts[0][0]), linesAdded: numstat?.linesAdded ?? 0, linesDeleted: numstat?.linesDeleted ?? 0, binary: numstat?.binary ?? false, oldPath: parts[2] });
        }
      } catch {
      }
    }
    const hunks = [];
    if (baseExists && targetExists && !refError) {
      try {
        hunks.push(...this.parseHunks(execGit(root, ["diff", "-U0", `${baseRef}..${targetRef}`])));
      } catch {
      }
    }
    const stats = {
      totalFiles: files.length,
      filesAdded: files.filter((f) => f.changeType === "added").length,
      filesModified: files.filter((f) => f.changeType === "modified").length,
      filesDeleted: files.filter((f) => f.changeType === "deleted").length,
      filesRenamed: files.filter((f) => f.changeType === "renamed").length,
      totalLinesAdded: files.reduce((s, f) => s + f.linesAdded, 0),
      totalLinesDeleted: files.reduce((s, f) => s + f.linesDeleted, 0),
      totalAdditions: files.reduce((s, f) => s + f.linesAdded, 0),
      totalDeletions: files.reduce((s, f) => s + f.linesDeleted, 0)
    };
    const changedRoutes = files.filter((f) => /\/(app|pages|src\/app|src\/pages)\//.test(f.path) || /\/routes\/|\/router\/|\/endpoints\//.test(f.path.toLowerCase())).map((f) => ({ route: "/" + f.path.replace(/^.*\/(app|pages|src\/app|src\/pages)\//, "").replace(/\.(tsx?|jsx?)$/, "").replace(/\[([^\]]+)\]/g, ":$1").replace(/\/+/g, "/"), file: f.path, changeType: f.changeType }));
    const changedApis = files.filter((f) => /\/api\/|\/rest\/|\/graphql\/|handler\.ts$|handler\.js$/.test(f.path)).map((f) => {
      const seg = f.path.split("/api/").pop()?.split("/rest/").pop()?.split("/graphql/").pop();
      return { path: "/" + (seg ?? f.path), file: f.path, changeType: f.changeType };
    });
    const changedComponents = files.map((f) => {
      const m = f.path.match(/\/([A-Z][a-zA-Z0-9_-]+)\.(tsx?|jsx?)$/);
      return m ? { name: m[1], file: f.path, changeType: f.changeType } : null;
    }).filter(Boolean);
    let hasWorkingTreeChanges = false;
    try {
      hasWorkingTreeChanges = execGit(root, ["status", "--porcelain"]).trim().length > 0;
    } catch {
    }
    return { baseRef, targetRef, files, hunks, stats, ownership: files.map((f) => detectOwnership(f.path)), changedRoutes, changedApis, changedComponents, riskLevel: assessRisk(files, hunks), hasWorkingTreeChanges, refError };
  }
  isAffected(diff, filePath) {
    return isPathAffectedByDiff(diff, filePath);
  }
  deriveRecommendation(diff) {
    return computeDiffRecommendation(diff);
  }
  getChangedFiles(baseRef, targetRef) {
    const root = getRepoRoot(this.cwd);
    const nameStatus = execGit(root, ["diff", "--name-status", `${baseRef}..${targetRef}`]);
    const numstat = execGit(root, ["diff", "--numstat", `${baseRef}..${targetRef}`]);
    return nameStatus.trim().split("\n").filter(Boolean).map((line) => {
      const parts = line.split("	");
      if (parts.length < 2) return null;
      const rawPath = parts[1];
      const ns = parseNumstatLine(numstat.split("\n").find((l) => l.includes(rawPath)) ?? "");
      return { path: rawPath, changeType: parseStatusFlag(parts[0][0]), linesAdded: ns?.linesAdded ?? 0, linesDeleted: ns?.linesDeleted ?? 0, binary: ns?.binary ?? false, oldPath: parts[2] };
    }).filter(Boolean);
  }
  getAvailableRefs() {
    const root = getRepoRoot(this.cwd);
    let current = "HEAD";
    try {
      current = execGit(root, ["branch", "--show-current"]).trim();
    } catch {
    }
    let branches = [];
    try {
      branches = execGit(root, ["branch", "--format=%(refname:short)"]).trim().split("\n").filter(Boolean);
    } catch {
    }
    let tags = [];
    try {
      tags = execGit(root, ["tag", "--list"]).trim().split("\n").filter(Boolean);
    } catch {
    }
    return { branches, tags, current };
  }
  // ─── Private ─────────────────────────────────────────────────────────────
  parseHunks(diffOutput) {
    const hunks = [];
    const lines = diffOutput.split("\n");
    let currentFile = "";
    let currentHunkIndex = 0;
    let currentHunk = null;
    let oldLine = 0;
    let newLine = 0;
    for (const rawLine of lines) {
      if (rawLine.startsWith("+++")) {
        currentFile = rawLine.replace(/^\+\+\+ b\//, "").trim().replace(/^\+\+\+ /, "").trim();
        if (currentFile === "/dev/null") currentFile = "";
        currentHunkIndex = 0;
        continue;
      }
      if (rawLine.startsWith("---")) {
        currentHunkIndex = 0;
        continue;
      }
      const match = rawLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        if (currentHunk) hunks.push(currentHunk);
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[3], 10);
        currentHunk = { filePath: currentFile, hunkIndex: currentHunkIndex++, oldStart: oldLine, oldLines: parseInt(match[2] || "1", 10), newStart: newLine, newLines: parseInt(match[4] || "1", 10), lines: [] };
        continue;
      }
      if (currentHunk) {
        const type = rawLine.startsWith("+") ? "added" : rawLine.startsWith("-") ? "deleted" : "context";
        const content = type === "context" ? rawLine.slice(1) : rawLine.slice(1);
        if (type === "deleted") currentHunk.lines.push({ type, content, oldLineNumber: oldLine++ });
        else if (type === "added") currentHunk.lines.push({ type, content, newLineNumber: newLine++ });
        else currentHunk.lines.push({ type, content, oldLineNumber: oldLine++, newLineNumber: newLine++ });
      }
    }
    if (currentHunk) hunks.push(currentHunk);
    return hunks;
  }
};
export {
  GitDiffEngine,
  computeDiffRecommendation,
  isPathAffectedByDiff
};
