/**
 * Detect Scripts
 * Parses package.json scripts and categorizes them
 */
export interface ScriptsResult {
    buildCommands: string[];
    devCommands: string[];
    lintCommands: string[];
    typecheckCommands: string[];
    testCommands: string[];
    packageScripts: Record<string, string>;
}
export declare function detectScripts(projectRoot: string): ScriptsResult;
/**
 * Get a summary of available scripts
 */
export declare function getScriptsSummary(scripts: ScriptsResult): string;
//# sourceMappingURL=detectScripts.d.ts.map