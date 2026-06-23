/**
 * sandboxRunner — execution utilities for sandboxed plugins.
 *
 * Runs plugin analysis callbacks inside a sandboxed context with:
 *  - Injected minimal API (no direct fs/net/child_process from parent)
 *  - Allowed file summaries instead of raw file access
 *  - Timeout enforcement
 *  - Permission checks at each operation
 */
import type { PluginPermission } from './types.js';
export interface SandboxedPluginContext {
    projectRoot: string;
    permissions: PluginPermission[];
    readFile(path: string): string | null;
    readFileIfAllowed(path: string, permission: PluginPermission): string | null;
    fileExists(path: string): boolean;
    listDir(path: string): string[];
    getPackageJson(): PackageJson | null;
    getDependencies(): Record<string, string>;
    createFinding(partial: PartialPluginFinding): PluginFinding;
    timeRemainingMs(): number;
}
export interface PartialPluginFinding {
    ruleId: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning' | 'info' | 'hint';
    category?: string;
    fix?: string;
}
export interface PluginFinding {
    id: string;
    ruleId: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning' | 'info' | 'hint';
    category?: string;
    fix?: string;
    pluginId: string;
    detectedAt: string;
}
export interface PackageJson {
    name: string;
    version: string;
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
}
export declare function buildSandboxContext(projectRoot: string, allowedFilePaths: Set<string>, permissions: PluginPermission[], timeoutMs: number, startTime: number, pluginId: string): SandboxedPluginContext;
export declare function isCommandAllowed(command: string): boolean;
export declare function sanitizeCommandOutput(output: string): string;
export declare function isDangerousCommand(command: string): boolean;
//# sourceMappingURL=sandboxRunner.d.ts.map