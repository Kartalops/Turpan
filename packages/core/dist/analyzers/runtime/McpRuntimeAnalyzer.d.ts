/**
 * McpRuntimeAnalyzer — security and runtime review for MCP servers.
 *
 * Applies to: appType === 'mcp-server' OR files matching MCP server patterns
 *
 * MCP servers have broad system access. This analyzer focuses on:
 * - Tool schema validation
 * - Unsafe tool detection (arbitrary shell, unrestricted FS, missing input validation)
 * - Secret leakage
 * - Missing workspace allowlist
 * - Missing input validation on tools
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class McpRuntimeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectMcpServerFiles;
    private analyzeMcpFile;
    private checkArbitraryShell;
    private checkUnrestrictedFilesystem;
    private checkWorkspaceAllowlist;
    private checkInputValidation;
    private checkSecretLeakage;
    private checkToolSchemas;
}
//# sourceMappingURL=McpRuntimeAnalyzer.d.ts.map