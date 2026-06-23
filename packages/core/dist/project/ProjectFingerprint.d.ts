/**
 * Project Fingerprint Types
 * Comprehensive project detection and metadata extraction
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
export type RuntimeType = 'node' | 'python' | 'deno' | 'bun' | 'unknown';
export type AppType = 'nextjs' | 'vite-react' | 'node-backend' | 'python-bot' | 'fastapi' | 'telegram-bot' | 'chrome-extension' | 'mcp-server' | 'docker' | 'unknown';
export type UIFramework = 'react' | 'vue' | 'svelte' | 'solid' | 'nextjs' | 'angular' | 'none' | 'unknown';
export type BackendFramework = 'express' | 'fastify' | 'nestjs' | 'nextjs' | 'fastapi' | 'django' | 'flask' | 'none' | 'unknown';
export type TestTool = 'vitest' | 'jest' | 'playwright' | 'cypress' | 'pytest' | 'none' | 'unknown';
export interface DatabaseHint {
    type: string;
    orm?: string;
    schemaFiles?: string[];
}
export interface AuthHint {
    type: string[];
    providers?: string[];
}
export interface DeploymentHint {
    platform?: string;
    dockerfile?: boolean;
    dockerCompose?: boolean;
    hasBuildScript?: boolean;
}
export interface RouteHint {
    type: 'pages' | 'app' | 'both';
    count: number;
    sampleRoutes?: string[];
}
export interface Entrypoint {
    name: string;
    path: string;
    type: 'cli' | 'server' | 'worker' | 'plugin' | 'unknown';
}
export interface EnvRequirement {
    name: string;
    description?: string;
    isSecret: boolean;
}
export interface ProjectFingerprint {
    projectRoot: string;
    projectName: string;
    repositoryStatus: {
        isGitRepo: boolean;
        branch?: string;
        commitHash?: string;
        isDirty?: boolean;
    };
    packageManager: PackageManager;
    lockFile?: string;
    languages: string[];
    runtimeType: RuntimeType;
    appType: AppType;
    uiFramework: UIFramework;
    backendFramework: BackendFramework;
    testTools: TestTool[];
    buildCommands: string[];
    devCommands: string[];
    lintCommands: string[];
    typecheckCommands: string[];
    testCommands: string[];
    packageScripts: Record<string, string>;
    dockerAvailable: boolean;
    dockerComposeAvailable: boolean;
    envFiles: string[];
    envRequirements: EnvRequirement[];
    routeHints: RouteHint[];
    entrypoints: Entrypoint[];
    databaseHints: DatabaseHint[];
    authHints: AuthHint[];
    deploymentHints: DeploymentHint;
    detectedFiles: string[];
    missingFiles: string[];
    fingerprintedAt: string;
}
/**
 * Redacts secret-like values from strings
 * Used to prevent accidental secret exposure in logs/reports
 */
export declare function redactSecrets(value: string): string;
/**
 * Checks if a value looks like a secret
 */
export declare function looksLikeSecret(key: string, value: string): boolean;
//# sourceMappingURL=ProjectFingerprint.d.ts.map