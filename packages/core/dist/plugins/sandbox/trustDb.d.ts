/**
 * PluginTrustDb — manages plugin trust levels and permissions persistently.
 *
 * Stores trusted plugin records in .turpan/trust-db.json
 * so that `turpan plugins trust <id>` persists across runs.
 */
import type { TrustedPluginEntry, PluginTrustLevel } from './types.js';
import type { PluginPermission } from './permissions.js';
export declare class PluginTrustDb {
    private dbPath;
    constructor(projectRoot: string);
    private loadDb;
    private saveDb;
    getTrustLevel(pluginId: string): PluginTrustLevel;
    getEntry(pluginId: string): TrustedPluginEntry | null;
    listEntries(): TrustedPluginEntry[];
    setTrust(pluginId: string, trustLevel: PluginTrustLevel, grantedPermissions: PluginPermission[], trustedBy?: string, notes?: string): TrustedPluginEntry;
    revokeTrust(pluginId: string): boolean;
    clearAll(): void;
}
//# sourceMappingURL=trustDb.d.ts.map