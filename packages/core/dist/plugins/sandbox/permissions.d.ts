/**
 * Plugin permissions — defines what a plugin is allowed to do.
 *
 * Permissions are declared in the plugin manifest and must be
 * explicitly granted by the user in turpan.yml security.plugins.grantedPermissions.
 */
import type { PluginPermission } from '@turpan/shared';
export type { PluginPermission } from '@turpan/shared';
export declare const PLUGIN_PERMISSIONS: readonly PluginPermission[];
export declare const PERMISSION_DESCRIPTIONS: Record<PluginPermission, string>;
/**
 * Default permissions granted to local-trusted plugins.
 * Built-in plugins get all permissions implicitly.
 */
export declare const LOCAL_TRUSTED_DEFAULT_PERMISSIONS: PluginPermission[];
/**
 * Default permissions granted to external-untrusted plugins.
 * Requires explicit user grant in config.
 */
export declare const EXTERNAL_UNTRUSTED_DEFAULT_PERMISSIONS: PluginPermission[];
/**
 * Check if a permission is granted to a plugin.
 */
export declare function isPermissionGranted(permission: PluginPermission, grantedPermissions: PluginPermission[]): boolean;
/**
 * Check if all required permissions are granted.
 */
export declare function allPermissionsGranted(required: PluginPermission[], granted: PluginPermission[]): {
    granted: boolean;
    missing: PluginPermission[];
};
//# sourceMappingURL=permissions.d.ts.map