// ── Re-exports ───────────────────────────────────────────────────────────────
export * from './ReviewOrchestrator.js';
export * from './ReviewPlan.js';
export * from './ReviewStage.js';
export * from './ReviewContext.js';
// ── Legacy runner (used by CLI) — delegates to new orchestrator ─────────────
import { createTimestampDir } from '@turpan/shared';
import { createRunContext } from '../context/index.js';
import { writeReports } from '../reports/index.js';
import { createLogger } from '../logger/index.js';
import { loadConfig } from '../config/index.js';
import { symlinkSync, existsSync, lstatSync, unlinkSync, mkdirSync } from 'fs';
import { detectProjectAsync } from '../project/index.js';
import { runReview, planReview } from './ReviewOrchestrator.js';
import { formatPlanSummary } from './ReviewPlan.js';
import { runDependencyAudit } from '@turpan/dependency-audit';
import { createFinding, confidence } from '../findings/Finding.js';
import { createEvidence } from '../findings/Evidence.js';
function ensureRunBaseDir(baseRunPath) {
    if (!existsSync(baseRunPath)) {
        mkdirSync(baseRunPath, { recursive: true });
    }
}
/**
 * Derive honest limitations of a dependency audit based on what was scanned.
 * These are surfaced in the report so users understand what was NOT covered.
 */
function deriveDepAuditLimitations(inv, audit) {
    const limitations = [];
    // Python transitive deps
    if (inv.projectType === 'python') {
        const hasUv = false; // uv.lock/poetry.lock not parsed yet
        if (!hasUv) {
            limitations.push('Python transitive dependencies from uv.lock / poetry.lock are not parsed — only requirements.txt and pyproject.toml are scanned.');
        }
    }
    // Online mode limitations
    if (audit.mode === 'online') {
        limitations.push('Online mode depends on OSV.dev and npm audit availability. Network failures fall back to the offline vulnerability database.');
    }
    else {
        limitations.push('Offline mode uses only the bundled vulnerability database. Coverage is conservative — production use should pair with online OSV/Snyk for comprehensive scanning.');
    }
    // License limitations
    const unknownLicenses = audit.licenseFindings.filter(l => l.license === null).length;
    if (unknownLicenses > 0) {
        limitations.push(`${unknownLicenses} dependencies did not declare a license. Self-reported licenses may be stale or incomplete — verify manually for compliance-critical projects.`);
    }
    // No findings at all
    if (audit.vulnerabilities.length === 0 && inv.dependencies.length > 0) {
        limitations.push('No vulnerabilities matched the offline database. This does NOT guarantee the project is vulnerability-free — unknown CVEs may exist.');
    }
    return limitations;
}
function convertDepAuditToFindings(auditResult) {
    const findings = [];
    let idCounter = 0;
    // Vulnerability findings
    for (const vf of auditResult.vulnerabilities) {
        const { dependency, vulnerability: vuln } = vf;
        const sev = vuln.severity;
        findings.push(createFinding({
            id: `dep-vuln-${++idCounter}`,
            title: `Vulnerable dependency: ${dependency.name}@${dependency.version}`,
            severity: sev,
            category: 'security',
            explanation: `${vuln.title}.${vuln.cveId ? ` CVE: ${vuln.cveId}` : ''} ${vuln.description}`,
            evidence: [
                createEvidence('command-log', {
                    label: 'dependency-audit',
                    excerpt: `${dependency.name}@${dependency.version} — ${vuln.title}${vuln.cveId ? ` (${vuln.cveId})` : ''}`,
                    timestamp: new Date().toISOString(),
                }),
            ],
            suggestedFix: `Update ${dependency.name} to a non-vulnerable version. Run: npm update ${dependency.name}`,
            fixable: 'manual',
            confidence: confidence(95),
            tags: [
                'dependency',
                'security',
                `vulnerability:${vuln.cveId ?? 'unknown'}`,
                `severity:${sev}`,
                `cvss:${vuln.cvssScore ?? 'n/a'}`,
            ],
        }));
    }
    // License findings
    for (const lf of auditResult.licenseFindings) {
        if (lf.risk === 'none')
            continue;
        const riskSeverity = lf.risk === 'high' ? 'high' : lf.risk === 'medium' ? 'medium' : 'low';
        findings.push(createFinding({
            id: `dep-license-${++idCounter}`,
            title: `License issue: ${lf.dependency.name}`,
            severity: riskSeverity,
            category: 'dependency',
            explanation: lf.reason,
            evidence: [
                createEvidence('command-log', {
                    label: 'license-audit',
                    excerpt: `${lf.dependency.name} (${lf.license ?? 'no license'}) — risk: ${lf.risk}`,
                    timestamp: new Date().toISOString(),
                }),
            ],
            suggestedFix: lf.policyViolation
                ? `Remove or replace ${lf.dependency.name} which violates your license policy.`
                : `Review the license for ${lf.dependency.name} and ensure it is appropriate for your project.`,
            fixable: 'manual',
            confidence: confidence(90),
            tags: ['dependency', 'license', `policyViolation:${lf.policyViolation}`],
        }));
    }
    return findings;
}
/**
 * Main entry point used by the CLI.
 * Detects fingerprint, runs the orchestrator, writes reports.
 */
export async function runAnalysis(options) {
    const { projectPath, deepAnalysis = false, uiAnalysis = false, fixMode = false, install = false, timeoutMs = 120_000, skipBuild = false, skipTests = false, skipLint = false, skipTypecheck = false, skipStaticQuality = false, skipSecurity = false, skipDeadCode = false, skipUi = false, skipRuntime = false, uiScenarios, skipScenarios = false, plugins, dependencyAudit = false, dependencyAuditOnline = false, signal, diffMode = false, diffResult, diffBaseRef, diffTargetRef, } = options;
    const config = loadConfig(projectPath);
    config.deepAnalysis = deepAnalysis;
    config.uiAnalysis = uiAnalysis;
    config.fixMode = fixMode;
    const baseRunPath = config.runPath || `${projectPath}/.turpan/runs`;
    // Ensure base run dir exists (don't fail if it doesn't or can't)
    try {
        ensureRunBaseDir(baseRunPath);
    }
    catch { /* ignore */ }
    const runPath = createTimestampDir(baseRunPath);
    // Create latest symlink (best-effort; don't fail the run if it can't)
    const latestPath = `${baseRunPath}/latest`;
    // existsSync returns false for a broken symlink. Use lstat so an old
    // `latest` link never prevents the current run from becoming discoverable.
    try {
        lstatSync(latestPath);
        unlinkSync(latestPath);
    }
    catch { /* no previous latest link */ }
    try {
        symlinkSync(runPath, latestPath, 'dir');
    }
    catch { /* ignore symlink errors */ }
    const logger = createLogger(runPath, config.logLevel);
    logger.info('Starting Turpan analysis', { projectPath, runPath, deepAnalysis, uiAnalysis });
    // Detect fingerprint (with caching)
    const fingerprint = await detectProjectAsync(projectPath);
    const skippedStages = [];
    if (skipBuild)
        skippedStages.push('build');
    if (skipTests)
        skippedStages.push('test');
    if (skipLint)
        skippedStages.push('lint');
    if (skipTypecheck)
        skippedStages.push('typecheck');
    if (skipStaticQuality)
        skippedStages.push('static-quality');
    if (skipSecurity)
        skippedStages.push('security-basic');
    if (skipDeadCode)
        skippedStages.push('dead-code-basic');
    if (skipUi)
        skippedStages.push('ui-live-basic');
    if (skipRuntime)
        skippedStages.push('runtime');
    // Run the orchestrator
    const result = await runReview({
        projectPath,
        fingerprint,
        config,
        deepAnalysis,
        uiAnalysis,
        fixMode,
        install,
        timeoutMs,
        skipBuild,
        skipTests,
        skipLint,
        skipTypecheck,
        skipUi,
        skipRuntime,
        uiScenarios,
        skipScenarios,
        plugins,
        diffMode,
        diffResult,
        stageOverrides: skippedStages.length > 0
            ? [...[
                    'project-fingerprint', 'install-check', 'script-detection', 'build', 'test', 'lint', 'typecheck',
                    'static-quality', 'security-basic', 'dead-code-basic', 'ui-live-basic', 'runtime', 'report',
                ]].filter(s => !skippedStages.includes(s))
            : undefined,
    });
    // ── Dependency Audit (runs after all stages, adds findings to the report) ──
    let dependencyAuditResult;
    if (dependencyAudit && !options.signal?.aborted) {
        try {
            const auditConfig = config.dependencyAudit ?? { enabled: true, online: dependencyAuditOnline, failOnCritical: true, licensePolicy: { disallowed: [], warnUnknown: true } };
            dependencyAuditResult = await runDependencyAudit(projectPath, { ...auditConfig, online: dependencyAuditOnline }, result.runId, options.signal);
            // Convert dependency audit results to Findings and merge
            const depFindings = convertDepAuditToFindings(dependencyAuditResult);
            for (const f of depFindings) {
                result.findings.push(f);
            }
            logger.info('Dependency audit completed', {
                vulnerabilities: dependencyAuditResult.vulnerabilities.length,
                licenseFindings: dependencyAuditResult.licenseFindings.length,
            });
        }
        catch (err) {
            logger.warn('Dependency audit failed', { error: err instanceof Error ? err.message : String(err) });
        }
    }
    // Build AnalysisResult for writeReports
    const ctx = createRunContext(projectPath, config, options.isInteractive);
    // ── Dependency Audit section (populated when --dependency-audit is enabled) ──
    let dependencyAuditSection;
    if (dependencyAuditResult) {
        const inv = dependencyAuditResult.inventory;
        const sbom = dependencyAuditResult.sbom;
        const daSection = {
            mode: dependencyAuditResult.mode,
            sbomPath: `runs/${result.runId}/sbom.json`,
            sbomCdxPath: `runs/${result.runId}/sbom.cdx.json`,
            componentCount: inv.dependencies.length,
            directCount: inv.dependencies.filter(d => d.source === 'direct').length,
            transitiveCount: inv.dependencies.filter(d => d.source === 'transitive').length,
            vulnerabilities: dependencyAuditResult.vulnerabilities.map(vf => ({
                name: vf.dependency.name,
                version: vf.dependency.version,
                severity: vf.vulnerability.severity === 'none' ? 'low' : vf.vulnerability.severity,
                cveId: vf.vulnerability.cveId,
                title: vf.vulnerability.title,
                source: vf.dependency.source,
                exploitedInWild: vf.vulnerability.exploitedInWild,
            })),
            licenses: dependencyAuditResult.licenseFindings.map(lf => ({
                name: lf.dependency.name,
                license: lf.license,
                risk: lf.risk,
                policyViolation: lf.policyViolation ?? false,
                reason: lf.reason,
            })),
            errors: dependencyAuditResult.errors,
            limitations: deriveDepAuditLimitations(inv, dependencyAuditResult),
        };
        dependencyAuditSection = daSection;
    }
    const analysisResult = {
        config: ctx.config,
        findings: result.findings,
        scorecard: {
            overall: result.scorecard.overall,
            categories: {
                correctness: result.scorecard.overall,
                security: result.scorecard.security,
                performance: result.scorecard.ui_runtime,
                maintainability: result.scorecard.architecture,
                codeCoverage: result.scorecard.test_health,
            },
            findingsCount: result.findings.length,
            criticalIssues: result.findings.filter(f => f.severity === 'critical').length,
            project_readiness: result.scorecard.release_readiness,
        },
        timestamp: new Date().toISOString(),
        duration: result.durationMs,
        projectPath,
        dependencyAudit: dependencyAuditSection,
        fingerprint: {
            projectName: fingerprint.projectName,
            appType: fingerprint.appType,
            languages: fingerprint.languages,
            packageManager: fingerprint.packageManager,
            uiFramework: fingerprint.uiFramework,
            backendFramework: fingerprint.backendFramework,
            testTools: fingerprint.testTools,
            databaseHints: fingerprint.databaseHints,
            authHints: fingerprint.authHints,
            dockerAvailable: fingerprint.dockerAvailable,
            dockerComposeAvailable: fingerprint.dockerComposeAvailable,
            envFiles: fingerprint.envFiles,
            detectedFiles: fingerprint.detectedFiles,
        },
    };
    writeReports(runPath, analysisResult);
    logger.info('Analysis completed', { duration: result.durationMs, findingsCount: result.findings.length, verdict: result.verdict });
    return runPath;
}
/**
 * Plan-only: print the stages that WOULD run without executing them.
 */
export async function planAnalysis(projectPath, options) {
    const config = loadConfig(projectPath);
    const fingerprint = await detectProjectAsync(projectPath);
    const plan = planReview(projectPath, fingerprint, config, options);
    console.log(formatPlanSummary(plan));
}
export async function runDoctorCheck() {
    const checks = [];
    const nodeVersion = process.version;
    const nodeOk = parseInt(nodeVersion.slice(1).split('.')[0]) >= 20;
    checks.push({ name: 'Node.js version', ok: nodeOk, message: nodeOk ? `${nodeVersion} (OK)` : `${nodeVersion} - need v20+` });
    try {
        const { execSync } = await import('child_process');
        const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
        checks.push({ name: 'pnpm', ok: true, message: `v${pnpmVersion}` });
    }
    catch {
        checks.push({ name: 'pnpm', ok: false, message: 'not found' });
    }
    const cwd = process.cwd();
    try {
        const testFile = `${cwd}/.turpan-doctor-test`;
        const { writeFileSync, unlinkSync } = await import('fs');
        writeFileSync(testFile, 'test');
        unlinkSync(testFile);
        checks.push({ name: 'Directory writable', ok: true, message: cwd });
    }
    catch {
        checks.push({ name: 'Directory writable', ok: false, message: `${cwd} - not writable` });
    }
    return { ok: checks.every(c => c.ok), checks };
}
//# sourceMappingURL=index.js.map