/**
 * Plugin permissions — defines what a plugin is allowed to do.
 *
 * Permissions are declared in the plugin manifest and must be
 * explicitly granted by the user in turpan.yml security.plugins.grantedPermissions.
 */
export const PLUGIN_PERMISSIONS = [
    'read-project-files',
    'read-package-metadata',
    'run-analysis-only',
    'propose-fixes',
    'ui-scenarios',
    'read-config',
    'network-fetch',
    'run-commands',
];
export const PERMISSION_DESCRIPTIONS = {
    'read-project-files': 'Read project source files (type-checked extensions only)',
    'read-package-metadata': 'Read package.json and dependency information',
    'run-analysis-only': 'Run analysis and report findings (no file modifications)',
    'propose-fixes': 'Propose code fixes for review before application',
    'ui-scenarios': 'Run UI test scenarios',
    'read-config': 'Read turpan.yml and .turpan configuration',
    'network-fetch': 'Make outbound HTTP requests for online vulnerability checks',
    'run-commands': 'Run sandboxed CLI commands (pnpm, npm, git, etc.)',
};
/**
 * Default permissions granted to local-trusted plugins.
 * Built-in plugins get all permissions implicitly.
 */
export const LOCAL_TRUSTED_DEFAULT_PERMISSIONS = [
    'read-project-files',
    'read-package-metadata',
    'run-analysis-only',
    'propose-fixes',
    'ui-scenarios',
    'read-config',
];
/**
 * Default permissions granted to external-untrusted plugins.
 * Requires explicit user grant in config.
 */
export const EXTERNAL_UNTRUSTED_DEFAULT_PERMISSIONS = [
    'read-package-metadata',
    'run-analysis-only',
];
/**
 * Check if a permission is granted to a plugin.
 */
export function isPermissionGranted(permission, grantedPermissions) {
    return grantedPermissions.includes(permission);
}
/**
 * Check if all required permissions are granted.
 */
export function allPermissionsGranted(required, granted) {
    const missing = required.filter(p => !isPermissionGranted(p, granted));
    return {
        granted: missing.length === 0,
        missing,
    };
}
//# sourceMappingURL=permissions.js.map