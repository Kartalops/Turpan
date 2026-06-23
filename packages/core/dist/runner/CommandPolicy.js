/**
 * CommandPolicy — blocklist and allowlist model for safe command execution.
 *
 * DANGEROUS_PATTERNS: commands that are NEVER allowed regardless of allowlist.
 * ALLOWLIST_MODELS: named command families that can be selectively enabled.
 */
export const DANGEROUS_PATTERNS = [
    // Destructive rm
    {
        pattern: /\brm\s+(-[rf]+\s+)*\/$/i,
        reason: 'Recursive root deletion — will destroy the filesystem',
        severity: 'critical',
    },
    {
        pattern: /\brm\s+-[rf]+\s+(\/|home|root|usr|etc|var|sys|dev)/i,
        reason: 'Recursive deletion of system directories',
        severity: 'critical',
    },
    {
        pattern: /\brm\s+-[rf]+\s+\*\s*$/i,
        reason: 'Recursive deletion of current directory contents',
        severity: 'critical',
    },
    // sudo
    {
        pattern: /\bsudo\s+/i,
        reason: 'Privilege escalation — Turpan should not need sudo',
        severity: 'high',
    },
    // Shell injection via curl|wget pipe to shell
    {
        pattern: /\b(curl|wget)\s+[^|;]*\|\s*(sh|bash|exec|eval)/i,
        reason: 'Pipe to shell — classic supply-chain attack vector',
        severity: 'critical',
    },
    {
        pattern: /\b(curl|wget)\s+[^|;]*\s+--insecure\s+[^|;]*\|\s*(sh|bash)/i,
        reason: 'Insecure download piped to shell',
        severity: 'critical',
    },
    // chmod 777
    {
        pattern: /\bchmod\s+777/i,
        reason: 'World-writable permissions — security risk',
        severity: 'high',
    },
    // Destructive database resets
    {
        pattern: /\b(drop|truncate)\s+(database|table|schema)/i,
        reason: 'Destructive database operation',
        severity: 'critical',
    },
    {
        pattern: /\brm\s+-[rf]+\s+.*(postgres|mysql|mongodb|redis|data\.sqlite)/i,
        reason: 'Deleting database files directly',
        severity: 'critical',
    },
    // Shell eval injection
    {
        pattern: /\beval\s+\$/i,
        reason: 'Shell eval with variable — potential injection',
        severity: 'high',
    },
    {
        pattern: /\bexec\s+\$/i,
        reason: 'Shell exec with variable — potential injection',
        severity: 'high',
    },
    // Fork bomb
    {
        pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}/i,
        reason: 'Fork bomb — will exhaust system resources',
        severity: 'critical',
    },
    // dd to disk
    {
        pattern: /\bdd\s+.*of=\/(dev\/)/i,
        reason: 'Direct disk write — data loss risk',
        severity: 'critical',
    },
    // Format disk
    {
        pattern: /\bmkfs(\s|$|\.)/i,
        reason: 'Filesystem format — destructive',
        severity: 'critical',
    },
    // Kill all processes
    {
        pattern: /\bpkill\s+-9\s+-f/i,
        reason: 'Force-killing processes — may corrupt state',
        severity: 'high',
    },
    // Docker system prune
    {
        pattern: /\bdocker\s+system\s+prune\s+-a/i,
        reason: 'Removing all Docker resources — destructive',
        severity: 'high',
    },
    // > /dev/sda style redirection to device
    {
        pattern: />\s*\/dev\/[a-z]/i,
        reason: 'Direct write to device file — data loss',
        severity: 'critical',
    },
];
const DEFAULT_ALLOWLIST = [
    'npm', 'pnpm', 'yarn', 'bun',
    'python', 'poetry', 'pip',
    'cargo', 'go', 'gradle', 'maven', 'dotnet',
    'tsc', 'eslint', 'prettier', 'vitest', 'jest', 'cypress', 'playwright',
    'git',
];
/**
 * Check if a command model is allowed by the policy.
 */
export function isModelAllowed(model, config) {
    const allowlist = config.allowlist ?? config.defaultAllowlist ?? DEFAULT_ALLOWLIST;
    return allowlist.includes(model);
}
/**
 * Check if a raw command string is suspicious (matches any dangerous pattern).
 */
export function checkDangerousPatterns(command) {
    for (const { pattern, reason, severity } of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
            return { blocked: true, reason, severity };
        }
    }
    return { blocked: false };
}
// ─── Package Manager Detection ────────────────────────────────────────────────
/** Detect which package manager a script uses */
export function detectPackageManager(script) {
    const lower = script.toLowerCase().trim();
    if (lower.startsWith('npm ') || lower.startsWith('npm run ') || lower === 'npm')
        return 'npm';
    if (lower.startsWith('pnpm ') || lower.startsWith('pnpm run ') || lower === 'pnpm')
        return 'pnpm';
    if (lower.startsWith('yarn ') || lower.startsWith('yarn run ') || lower === 'yarn')
        return 'yarn';
    if (lower.startsWith('bun ') || lower.startsWith('bun run ') || lower === 'bun')
        return 'bun';
    if (lower.startsWith('python ') || lower.startsWith('python3 ') || lower.startsWith('pip '))
        return 'python';
    if (lower.startsWith('cargo ') || lower.startsWith('cargo run '))
        return 'cargo';
    if (lower.startsWith('go ') && !lower.startsWith('go install'))
        return 'go';
    if (lower.startsWith('gradle ') || lower === 'gradlew')
        return 'gradle';
    if (lower.startsWith('mvn ') || lower === 'mvnw')
        return 'maven';
    if (lower.startsWith('dotnet '))
        return 'dotnet';
    if (lower.startsWith('tsc'))
        return 'tsc';
    if (lower.startsWith('eslint'))
        return 'eslint';
    if (lower.startsWith('prettier'))
        return 'prettier';
    if (lower.startsWith('vitest'))
        return 'vitest';
    if (lower.startsWith('jest'))
        return 'jest';
    if (lower.startsWith('git '))
        return 'git';
    return null;
}
const DANGEROUS_SCRIPT_PATTERNS = [
    // Script that itself contains dangerous patterns (inlined)
    {
        pattern: /\brm\s+-[rf]+\s+/i,
        reason: 'Script contains dangerous rm -rf command',
        severity: 'critical',
    },
    {
        pattern: /curl\s+[^|;]*\|\s*(sh|bash)/i,
        reason: 'Script pipes curl to shell — supply-chain risk',
        severity: 'critical',
    },
    {
        pattern: /wget\s+[^|;]*\|\s*(sh|bash)/i,
        reason: 'Script pipes wget to shell — supply-chain risk',
        severity: 'critical',
    },
    {
        pattern: /sudo\s+/i,
        reason: 'Script uses sudo — privilege escalation risk',
        severity: 'high',
    },
];
/**
 * Validate a package.json script string against the policy.
 * Returns whether the script is allowed and any blocking reason.
 */
export function validateScript(scriptName, scriptContent, config = {}) {
    // Check if the script itself contains dangerous patterns
    for (const { pattern, reason, severity } of DANGEROUS_SCRIPT_PATTERNS) {
        if (pattern.test(scriptContent)) {
            return { allowed: false, reason, severity };
        }
    }
    // Check package manager is allowed
    const model = detectPackageManager(scriptContent);
    if (model !== null) {
        if (!isModelAllowed(model, config)) {
            return {
                allowed: false,
                reason: `Package manager '${model}' is not in the allowlist`,
                severity: 'high',
                matchedModel: model,
            };
        }
    }
    else {
        // Unknown command — block if not explicitly allowed
        if (config.allowlist &&
            !config.allowlist.includes('npm') && // general commands not in allowlist
            scriptContent.trim().length > 0) {
            // Check if it matches any allowlist model pattern
            const hasAllowedPrefix = (scriptContent.startsWith('npm ') ||
                scriptContent.startsWith('pnpm ') ||
                scriptContent.startsWith('yarn ') ||
                scriptContent.startsWith('bun ') ||
                scriptContent.startsWith('python ') ||
                scriptContent.startsWith('python3 ') ||
                scriptContent.startsWith('cargo ') ||
                scriptContent.startsWith('go ') ||
                scriptContent.startsWith('tsc') ||
                scriptContent.startsWith('eslint') ||
                scriptContent.startsWith('prettier') ||
                scriptContent.startsWith('vitest') ||
                scriptContent.startsWith('jest'));
            if (!hasAllowedPrefix) {
                return {
                    allowed: false,
                    reason: `Script uses unknown command — not in allowlist: ${scriptContent.split(' ')[0]}`,
                    severity: 'high',
                };
            }
        }
    }
    return { allowed: true, matchedModel: model ?? undefined };
}
//# sourceMappingURL=CommandPolicy.js.map