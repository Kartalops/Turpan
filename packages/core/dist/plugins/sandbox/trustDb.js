/**
 * PluginTrustDb — manages plugin trust levels and permissions persistently.
 *
 * Stores trusted plugin records in .turpan/trust-db.json
 * so that `turpan plugins trust <id>` persists across runs.
 */
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { DEFAULT_TRUSTED_PLUGINS } from './defaults.js';
export class PluginTrustDb {
    dbPath;
    constructor(projectRoot) {
        this.dbPath = join(projectRoot, '.turpan', 'trust-db.json');
    }
    loadDb() {
        if (!existsSync(this.dbPath)) {
            return { ...DEFAULT_TRUSTED_PLUGINS };
        }
        try {
            const content = readFileSync(this.dbPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return { ...DEFAULT_TRUSTED_PLUGINS };
        }
    }
    saveDb(db) {
        const dir = join(this.dbPath, '..');
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(this.dbPath, JSON.stringify(db, null, 2), 'utf-8');
    }
    getTrustLevel(pluginId) {
        const db = this.loadDb();
        return db[pluginId]?.trustLevel ?? 'external-untrusted';
    }
    getEntry(pluginId) {
        const db = this.loadDb();
        return db[pluginId] ?? null;
    }
    listEntries() {
        const db = this.loadDb();
        return Object.values(db);
    }
    setTrust(pluginId, trustLevel, grantedPermissions, trustedBy, notes) {
        const db = this.loadDb();
        const entry = {
            id: pluginId,
            trustLevel,
            grantedPermissions,
            trustedSince: new Date().toISOString(),
            trustedBy,
            notes,
        };
        db[pluginId] = entry;
        this.saveDb(db);
        return entry;
    }
    revokeTrust(pluginId) {
        const db = this.loadDb();
        if (!db[pluginId])
            return false;
        delete db[pluginId];
        this.saveDb(db);
        return true;
    }
    clearAll() {
        this.saveDb({});
    }
}
//# sourceMappingURL=trustDb.js.map