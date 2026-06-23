/**
 * sandboxRunner — execution utilities for sandboxed plugins.
 *
 * Runs plugin analysis callbacks inside a sandboxed context with:
 *  - Injected minimal API (no direct fs/net/child_process from parent)
 *  - Allowed file summaries instead of raw file access
 *  - Timeout enforcement
 *  - Permission checks at each operation
 */
import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, join, extname, relative } from 'path';
// ── Allowed file extensions by permission ────────────────────────────────────
const PERMISSION_ALLOWED_EXTENSIONS = {
    'read-project-files': ['.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.md', '.txt', '.css', '.scss', '.html'],
    'read-package-metadata': ['package.json'],
};
const ALLOWED_COMMANDS = new Set([
    'pnpm', 'npm', 'yarn', 'bun',
    'git',
    'node', 'npx',
    'python', 'pip', 'uv',
    'docker', 'docker-compose',
]);
const DANGEROUS_PATTERNS = [
    /\brm\s+(-[rf]+\s+)*\/$/i,
    /\bsudo\s+/i,
    /\b(curl|wget)\s+[^|;]*\|\s*(sh|bash)/i,
    /\bdd\s+if=/i,
    /\bmkfs\b/i,
    /\bpasswd\b/i,
    /\bchpasswd\b/i,
    /\buseradd\b/i,
    /\buserdel\b/i,
];
// ── Sandbox Context Builder ───────────────────────────────────────────────────
let findingCounter = 0;
export function buildSandboxContext(projectRoot, allowedFilePaths, permissions, timeoutMs, startTime, pluginId) {
    const isAllowed = (filePath) => {
        const resolved = resolve(projectRoot, filePath);
        const rel = relative(projectRoot, resolved);
        // Block path traversal
        if (rel.startsWith('..') || rel.includes('..'))
            return false;
        // Check against allowlist
        return allowedFilePaths.has(resolved) || allowedFilePaths.has(rel);
    };
    const isExtensionAllowed = (filePath, permission) => {
        const ext = extname(filePath).toLowerCase();
        const allowed = PERMISSION_ALLOWED_EXTENSIONS[permission];
        if (!allowed)
            return false;
        return allowed.includes(ext);
    };
    return {
        projectRoot,
        permissions,
        readFile(path) {
            if (!this.permissions.includes('read-project-files'))
                return null;
            if (!isAllowed(path))
                return null;
            if (!isExtensionAllowed(path, 'read-project-files'))
                return null;
            try {
                return readFileSync(resolve(projectRoot, path), 'utf-8');
            }
            catch {
                return null;
            }
        },
        readFileIfAllowed(path, permission) {
            if (!this.permissions.includes(permission))
                return null;
            if (permission === 'read-project-files')
                return this.readFile(path);
            if (permission === 'read-package-metadata') {
                if (extname(path).toLowerCase() !== '.json')
                    return null;
                if (!isAllowed(path))
                    return null;
                try {
                    return readFileSync(resolve(projectRoot, path), 'utf-8');
                }
                catch {
                    return null;
                }
            }
            return null;
        },
        fileExists(path) {
            if (!isAllowed(path))
                return false;
            try {
                statSync(resolve(projectRoot, path));
                return true;
            }
            catch {
                return false;
            }
        },
        listDir(path) {
            if (!this.permissions.includes('read-project-files'))
                return [];
            if (!isAllowed(path))
                return [];
            try {
                return readdirSync(resolve(projectRoot, path));
            }
            catch {
                return [];
            }
        },
        getPackageJson() {
            if (!this.permissions.includes('read-package-metadata'))
                return null;
            const pkgPath = join(projectRoot, 'package.json');
            if (!isAllowed(pkgPath))
                return null;
            try {
                const content = readFileSync(pkgPath, 'utf-8');
                return JSON.parse(content);
            }
            catch {
                return null;
            }
        },
        getDependencies() {
            const pkg = this.getPackageJson();
            return {
                ...(pkg?.dependencies ?? {}),
                ...(pkg?.devDependencies ?? {}),
            };
        },
        createFinding(partial) {
            findingCounter++;
            return {
                id: `plugin-${pluginId}-finding-${findingCounter}`,
                ruleId: partial.ruleId,
                message: partial.message,
                file: partial.file,
                line: partial.line,
                column: partial.column,
                severity: partial.severity,
                category: partial.category,
                fix: partial.fix,
                pluginId,
                detectedAt: new Date().toISOString(),
            };
        },
        timeRemainingMs() {
            const elapsed = Date.now() - startTime;
            return Math.max(0, timeoutMs - elapsed);
        },
    };
}
// ── Command sanitization for sandboxed plugins ─────────────────────────────────
export function isCommandAllowed(command) {
    const cmd = command.trim().split(/\s+/)[0];
    return ALLOWED_COMMANDS.has(cmd);
}
export function sanitizeCommandOutput(output) {
    // Truncate long outputs and remove any embedded secrets patterns
    const MAX_OUTPUT = 50_000;
    let sanitized = output.slice(0, MAX_OUTPUT);
    if (output.length > MAX_OUTPUT) {
        sanitized += '\n[output truncated]';
    }
    // Remove potential secret patterns
    sanitized = sanitized
        .replace(/(?<=["'])[a-zA-Z0-9_-]{20,}(?=["'])/g, '[REDACTED]')
        .replace(/\b(?:sk|pk|token|secret|key|password|passwd)[ "-]*[a-zA-Z0-9_/+=]{10,}/gi, '[REDACTED]');
    return sanitized;
}
export function isDangerousCommand(command) {
    return DANGEROUS_PATTERNS.some(p => p.test(command));
}
//# sourceMappingURL=sandboxRunner.js.map