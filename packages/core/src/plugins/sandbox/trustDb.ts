/**
 * PluginTrustDb — manages plugin trust levels and permissions persistently.
 *
 * Stores trusted plugin records in .turpan/trust-db.json
 * so that `turpan plugins trust <id>` persists across runs.
 */

import { resolve, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { TrustedPluginEntry, PluginTrustLevel } from './types.js';
import type { PluginPermission } from './permissions.js';
import { DEFAULT_TRUSTED_PLUGINS } from './defaults.js';

export class PluginTrustDb {
  private dbPath: string;

  constructor(projectRoot: string) {
    this.dbPath = join(projectRoot, '.turpan', 'trust-db.json');
  }

  private loadDb(): Record<string, TrustedPluginEntry> {
    if (!existsSync(this.dbPath)) {
      return { ...DEFAULT_TRUSTED_PLUGINS };
    }
    try {
      const content = readFileSync(this.dbPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { ...DEFAULT_TRUSTED_PLUGINS };
    }
  }

  private saveDb(db: Record<string, TrustedPluginEntry>): void {
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.dbPath, JSON.stringify(db, null, 2), 'utf-8');
  }

  getTrustLevel(pluginId: string): PluginTrustLevel {
    const db = this.loadDb();
    return db[pluginId]?.trustLevel ?? 'external-untrusted';
  }

  getEntry(pluginId: string): TrustedPluginEntry | null {
    const db = this.loadDb();
    return db[pluginId] ?? null;
  }

  listEntries(): TrustedPluginEntry[] {
    const db = this.loadDb();
    return Object.values(db);
  }

  setTrust(
    pluginId: string,
    trustLevel: PluginTrustLevel,
    grantedPermissions: PluginPermission[],
    trustedBy?: string,
    notes?: string
  ): TrustedPluginEntry {
    const db = this.loadDb();
    const entry: TrustedPluginEntry = {
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

  revokeTrust(pluginId: string): boolean {
    const db = this.loadDb();
    if (!db[pluginId]) return false;
    delete db[pluginId];
    this.saveDb(db);
    return true;
  }

  clearAll(): void {
    this.saveDb({});
  }
}
