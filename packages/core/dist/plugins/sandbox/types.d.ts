/**
 * Shared types for the plugin sandboxing system.
 */
import type { Plugin } from '../Plugin.js';
import type { PluginPermission, PluginTrustLevel, PluginSandboxMode, PluginProcessSandboxConfig } from '@turpan/shared';
export type { PluginPermission, PluginTrustLevel, PluginSandboxMode, PluginProcessSandboxConfig };
export type PluginSecurityConfig = {
    allowExternal: boolean;
    sandboxExternal: boolean;
    sandboxMode: PluginSandboxMode;
    processSandbox: PluginProcessSandboxConfig;
    maxPluginRuntimeMs: number;
    memoryCapMb?: number;
    localTrustedPermissions?: PluginPermission[];
    externalUntrustedPermissions?: PluginPermission[];
    pluginTrust?: Record<string, {
        level?: PluginTrustLevel;
        permissions?: PluginPermission[];
    }>;
};
export interface TrustedPluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    dependsOn?: string[];
    permissions?: PluginPermission[];
    contributes?: {
        analyzers?: boolean;
        rulesets?: boolean;
        scenarios?: boolean;
        detectors?: boolean;
        fixers?: boolean;
        commands?: boolean;
    };
    supportedAppTypes?: string[];
    homepage?: string;
    repository?: string;
}
export interface ManifestValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface TrustedPluginEntry {
    id: string;
    trustLevel: PluginTrustLevel;
    grantedPermissions: PluginPermission[];
    trustedSince: string;
    trustedBy?: string;
    notes?: string;
}
export interface SandboxedPluginResult {
    success: boolean;
    error?: string;
    plugin?: Plugin;
    pluginExports?: Record<string, unknown>;
    timedOut?: boolean;
    crashed?: boolean;
    permissionDenied?: PluginPermission;
}
//# sourceMappingURL=types.d.ts.map