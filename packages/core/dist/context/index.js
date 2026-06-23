import { detectProject } from '../project/index.js';
export function createRunContext(projectPath, config, isInteractive = false) {
    const project = detectProject(projectPath);
    return {
        id: `run-${Date.now()}`,
        project,
        config,
        startTime: Date.now(),
        isInteractive,
    };
}
export function createEmptyScorecard() {
    return {
        overall: 0,
        categories: {
            correctness: 0,
            security: 0,
            performance: 0,
            maintainability: 0,
            codeCoverage: 0,
        },
        findingsCount: 0,
        criticalIssues: 0,
        project_readiness: undefined, // Placeholder for future scoring
    };
}
export function createEmptyFindings() {
    return [];
}
export function finalizeContext(ctx, findings, scorecard) {
    return {
        config: ctx.config,
        findings,
        scorecard,
        timestamp: new Date().toISOString(),
        duration: Date.now() - ctx.startTime,
        projectPath: ctx.project.projectRoot,
        fingerprint: {
            projectName: ctx.project.projectName,
            appType: ctx.project.appType,
            languages: ctx.project.languages,
            packageManager: ctx.project.packageManager,
            uiFramework: ctx.project.uiFramework,
            backendFramework: ctx.project.backendFramework,
            testTools: ctx.project.testTools,
            databaseHints: ctx.project.databaseHints,
            authHints: ctx.project.authHints,
            dockerAvailable: ctx.project.dockerAvailable,
            dockerComposeAvailable: ctx.project.dockerComposeAvailable,
            envFiles: ctx.project.envFiles,
            detectedFiles: ctx.project.detectedFiles,
        },
    };
}
//# sourceMappingURL=index.js.map