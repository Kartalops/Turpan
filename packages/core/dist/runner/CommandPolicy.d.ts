/**
 * CommandPolicy — blocklist and allowlist model for safe command execution.
 *
 * DANGEROUS_PATTERNS: commands that are NEVER allowed regardless of allowlist.
 * ALLOWLIST_MODELS: named command families that can be selectively enabled.
 */
/** Regex-safe dangerous pattern entries */
interface DangerousPattern {
    pattern: RegExp;
    reason: string;
    severity: 'critical' | 'high';
}
export declare const DANGEROUS_PATTERNS: DangerousPattern[];
/** A named command family that can be allowed or denied */
export type AllowlistModel = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'python' | 'poetry' | 'pip' | 'cargo' | 'go' | 'gradle' | 'maven' | 'dotnet' | 'make' | 'tsc' | 'eslint' | 'prettier' | 'vitest' | 'jest' | 'cypress' | 'playwright' | 'docker' | 'git';
/** Policy configuration */
export interface CommandPolicyConfig {
    /** Explicitly allow this set of command models */
    allowlist?: AllowlistModel[];
    /** Block specific dangerous patterns even in allowed scripts */
    blockDangerousPatterns?: boolean;
    /** Allow shell operators (| > && || ;) — risky */
    allowShellOperators?: boolean;
    /** Default allowlist if none specified */
    defaultAllowlist?: AllowlistModel[];
}
/**
 * Check if a command model is allowed by the policy.
 */
export declare function isModelAllowed(model: AllowlistModel, config: CommandPolicyConfig): boolean;
/**
 * Check if a raw command string is suspicious (matches any dangerous pattern).
 */
export declare function checkDangerousPatterns(command: string): {
    blocked: boolean;
    reason?: string;
    severity?: 'critical' | 'high';
};
/** Detect which package manager a script uses */
export declare function detectPackageManager(script: string): AllowlistModel | null;
export interface ScriptValidation {
    allowed: boolean;
    reason?: string;
    severity?: 'critical' | 'high';
    matchedModel?: AllowlistModel;
}
/**
 * Validate a package.json script string against the policy.
 * Returns whether the script is allowed and any blocking reason.
 */
export declare function validateScript(scriptName: string, scriptContent: string, config?: CommandPolicyConfig): ScriptValidation;
export {};
//# sourceMappingURL=CommandPolicy.d.ts.map