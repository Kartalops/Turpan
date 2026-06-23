import type { TurpanConfig } from '@turpan/shared';
export declare class ConfigParseError extends Error {
    line?: number | undefined;
    constructor(message: string, line?: number | undefined);
}
/**
 * Load turpan.yml from a project path.
 * Tries YAML first, falls back to JSON, then to defaults.
 * Never throws — returns defaults if anything goes wrong.
 */
export declare function loadConfig(projectPath: string): TurpanConfig;
export declare function saveConfig(projectPath: string, config: Partial<TurpanConfig>): void;
export declare function createDefaultConfig(projectPath: string): TurpanConfig;
/**
 * Simple YAML parser supporting:
 * - top-level scalars
 * - nested objects via 2-space indent
 * - arrays via `- value` under a key
 * - inline lists: `key: [a, b, c]`
 * - comments (`#`)
 * - booleans / numbers / strings (quoted and unquoted)
 * - empty lines
 */
export declare function parseYaml(yaml: string): Record<string, unknown>;
export declare function stringifyYaml(obj: Record<string, unknown>): string;
//# sourceMappingURL=index.d.ts.map