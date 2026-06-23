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
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { walkFiles } from '../../shared/index.js';
export class McpRuntimeAnalyzer {
    id = 'mcp-runtime';
    name = 'MCP Server Runtime Analyzer';
    categories = ['runtime', 'mcp', 'security'];
    supports(fp) {
        return fp.appType === 'mcp-server' || fp.languages.includes('typescript');
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        // 1. Detect MCP server files
        const mcpFiles = await this.detectMcpServerFiles(ctx.projectRoot);
        if (mcpFiles.length === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // 2. Analyze each MCP file for security issues
        for (const file of mcpFiles) {
            const fileFindings = await this.analyzeMcpFile(ctx.projectRoot, file);
            findings.push(...fileFindings);
        }
        return {
            analyzerId: this.id,
            findings,
            artifacts: { mcpFiles },
            durationMs: 0,
            errors,
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // MCP server file detection
    // ─────────────────────────────────────────────────────────────────────────
    async detectMcpServerFiles(projectRoot) {
        const candidates = [];
        // Direct MCP indicators
        const mcpIndicators = [
            'mcp-server',
            'mcp_server',
            'mcp-server.ts',
            'mcp-server.js',
            'mcp',
            'server.ts',
            'server.js',
        ];
        const allFiles = await walkFiles({
            cwd: projectRoot,
            extensions: ['ts', 'js'],
            ignoreDirs: new Set(['node_modules', '.git', '__pycache__', 'dist', 'build']),
        });
        for (const file of allFiles) {
            const relPath = relative(projectRoot, file).replace(/\\/g, '/');
            // Check filename
            if (mcpIndicators.some(ind => relPath.toLowerCase().includes(ind))) {
                candidates.push(file);
                continue;
            }
            // Check content for MCP imports/patterns
            try {
                const content = await readFile(file, 'utf-8');
                if (/@modelcontextprotocol|from ['"]@modelcontextprotocol|from ['"]@anthropic-ai\/mcpsdk/i.test(content) ||
                    /mcp\.server|server\.start|ListResources|list_tools|call_tool|createServer/i.test(content)) {
                    candidates.push(file);
                }
            }
            catch {
                // skip
            }
        }
        // Check package.json for mcp dependency
        try {
            const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['@modelcontextprotocol/server'] || deps['@anthropic-ai/mcp-sdk']) {
                // Find the main server file
                const main = pkg.main || pkg.exports?.['.']?.import || pkg.exports?.['.']?.default;
                if (main) {
                    candidates.push(join(projectRoot, main));
                }
            }
        }
        catch {
            // not found
        }
        return [...new Set(candidates)];
    }
    // ─────────────────────────────────────────────────────────────────────────
    // MCP file analysis
    // ─────────────────────────────────────────────────────────────────────────
    async analyzeMcpFile(projectRoot, file) {
        const findings = [];
        const relPath = relative(projectRoot, file);
        try {
            const content = await readFile(file, 'utf-8');
            // 1. Detect unsafe tools (arbitrary shell execution)
            findings.push(...this.checkArbitraryShell(relPath, content, file));
            // 2. Detect unrestricted filesystem access
            findings.push(...this.checkUnrestrictedFilesystem(relPath, content, file));
            // 3. Detect missing workspace allowlist
            findings.push(...this.checkWorkspaceAllowlist(relPath, content, file));
            // 4. Detect missing input validation
            findings.push(...this.checkInputValidation(relPath, content, file));
            // 5. Detect secret leakage in responses
            findings.push(...this.checkSecretLeakage(relPath, content, file));
            // 6. Detect overly broad tool schemas
            findings.push(...this.checkToolSchemas(relPath, content, file));
        }
        catch {
            // skip unreadable
        }
        return findings;
    }
    checkArbitraryShell(relPath, content, file) {
        const findings = [];
        const shellPatterns = [
            { re: /child_process|exec\(|execSync\(|spawn\(.*shell:\s*true/i, label: 'child_process with shell' },
            { re: /\bash\b|\/bin\/sh|bash\s+-c/i, label: 'bash shell invocation' },
            { re: /os\.system\(|subprocess\.call\(.*shell\s*=\s*True/i, label: 'shell command' },
            { re: /shell\s*:\s*true|\$\(.*\)/i, label: 'shell expansion' },
        ];
        for (const { re, label } of shellPatterns) {
            if (re.test(content)) {
                findings.push(createFinding({
                    id: `mcp-arbitrary-shell-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `MCP server allows arbitrary shell execution: ${label} in ${relPath}`,
                    explanation: `The MCP server in "${relPath}" executes shell commands. MCP servers with shell access can be exploited to run arbitrary commands on the host if any tool input is user-controlled. This is a CRITICAL security risk.`,
                    severity: 'critical',
                    category: 'security',
                    file,
                    fixable: 'manual',
                    confidence: confidence(90),
                    tags: ['mcp', 'security', 'shell', 'arbitrary-execution', 'critical'],
                    evidence: [
                        createEvidence('text', { label: 'pattern', excerpt: label }),
                    ],
                    suggestedFix: `Remove shell execution from MCP tools. If shell access is required, validate input against an explicit allowlist and use parameterized commands (no shell=True). Consider if a native API call can replace the shell command.`,
                }));
            }
        }
        return findings;
    }
    checkUnrestrictedFilesystem(relPath, content, file) {
        const findings = [];
        // Check for unrestricted file read/write patterns
        // Broader patterns to catch variable-based paths (args.path, req.params.path, etc.)
        const fsPatterns = [
            { re: /readFile\s*\(\s*(?:args|params|req|request|input)\s*\.\s*\w+/i, label: 'readFile with request variable (no validation)' },
            { re: /writeFile\s*\(\s*(?:args|params|req|request|input)\s*\.\s*\w+/i, label: 'writeFile with request variable (no validation)' },
            { re: /readdir\s*\(\s*(?:args|params|req|request|input)\s*\.\s*\w+/i, label: 'readdir with request variable (no validation)' },
            { re: /readdir\s*\(\s*["'].*?\*|glob\.sync\(/i, label: 'recursive readdir or glob (unrestricted)' },
            { re: /rm\s*\(|unlink\s*\(|fs\.unlink/i, label: 'file deletion' },
            { re: /__dirname\s*\+\s*req\.|\.\.\/.*req\.|path\.join\(__dirname.*req\./i, label: 'path traversal via request' },
        ];
        const hasFileOps = /readFile|writeFile|readdir|opendir|createReadStream|open\(.*['"]r['"]/i.test(content);
        if (hasFileOps) {
            for (const { re, label } of fsPatterns) {
                if (re.test(content)) {
                    findings.push(createFinding({
                        id: `mcp-unrestricted-fs-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `MCP server has unrestricted filesystem access: ${label} in ${relPath}`,
                        explanation: `The MCP server in "${relPath}" accesses the filesystem without clear restrictions. If tool inputs are user-controlled, attackers can read sensitive files (SSH keys, .env, /etc/passwd) or write to arbitrary locations.`,
                        severity: 'critical',
                        category: 'security',
                        file,
                        fixable: 'manual',
                        confidence: confidence(85),
                        tags: ['mcp', 'security', 'filesystem', 'path-traversal'],
                        evidence: [
                            createEvidence('text', { label: 'pattern', excerpt: label }),
                        ],
                        suggestedFix: `Implement a workspace allowlist: restrict all file operations to specific directories (e.g., process.cwd()/workspace). Validate paths with realpath() and reject anything outside the allowed root. Never use user input directly in file paths.`,
                    }));
                }
            }
        }
        return findings;
    }
    checkWorkspaceAllowlist(relPath, content, file) {
        const findings = [];
        // Look for actual workspace restriction IMPLEMENTATION patterns (not comments)
        // Only count matches that are not inside comment-only lines
        const codeLines = content
            .split('\n')
            .filter(line => {
            const trimmed = line.trim();
            // Keep lines that have actual code (not just comments)
            return !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
        })
            .join('\n');
        const hasWorkspaceCheck = /allowedPaths\s*=|workspaceRoot|isInWorkspace\s*\(|realpath\s*\(|normalize\s*\(.*workspace|checkWorkspace|validateWorkspace/i.test(codeLines);
        const hasFileOps = /readdir|readFile|writeFile|stat\(|lstat\(/i.test(content);
        if (hasFileOps && !hasWorkspaceCheck) {
            findings.push(createFinding({
                id: `mcp-no-workspace-allowlist-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                title: `MCP server performs file operations without workspace allowlist in ${relPath}`,
                explanation: `The MCP server in "${relPath}" has file operation capabilities but no workspace allowlist. Without restricting accessible paths, a compromised or misused tool can access any file on the system.`,
                severity: 'high',
                category: 'security',
                file,
                fixable: 'manual',
                confidence: confidence(80),
                tags: ['mcp', 'security', 'workspace-restriction', 'filesystem'],
                evidence: [
                    createEvidence('text', { label: 'has-workspace-check', excerpt: String(hasWorkspaceCheck) }),
                ],
                suggestedFix: `Define a workspace root (e.g., process.cwd() + '/workspace') and validate all file paths: \`const resolved = realpath(path); if (!resolved.startsWith(workspaceRoot)) throw new Error('Path outside workspace')\`.`,
            }));
        }
        return findings;
    }
    checkInputValidation(relPath, content, file) {
        const findings = [];
        // Check for tools that accept user input without validation
        const toolDefPatterns = [
            /name:\s*["'][^"']+["'],?\s*description:\s*["'][^"']+["']/g,
        ];
        // Look for tools without inputSchema or with empty inputSchema
        const hasInputSchema = /inputSchema:\s*\{|inputSchema:\s*\[\]/i.test(content);
        const hasToolDef = /tools\.push|registerTool|tools\.register|setRequestHandler/i.test(content);
        if (hasToolDef && !hasInputSchema) {
            findings.push(createFinding({
                id: `mcp-no-input-validation-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                title: `MCP tools lack input schema validation in ${relPath}`,
                explanation: `The MCP server in "${relPath}" defines tools but has no inputSchema. Without input validation schemas, invalid tool inputs will cause runtime errors or unexpected behavior. The MCP protocol recommends JSON Schema validation.`,
                severity: 'medium',
                category: 'security',
                file,
                fixable: 'manual',
                confidence: confidence(70),
                tags: ['mcp', 'schema', 'validation', 'input'],
                evidence: [
                    createEvidence('text', { label: 'has-input-schema', excerpt: String(hasInputSchema) }),
                ],
                suggestedFix: `Add inputSchema to each tool definition using JSON Schema: \`inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }\`. Validate inputs before using them.`,
            }));
        }
        // Check for SQL queries without parameterization (in MCP tool context)
        const hasSqlWithoutParam = /query\s*\(\s*["'].*?\+.*?\)|execute\s*\(\s*["'].*?\+.*?["']/i.test(content);
        if (hasSqlWithoutParam) {
            findings.push(createFinding({
                id: `mcp-sql-injection-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                title: `Potential SQL injection in MCP tool in ${relPath}`,
                explanation: `The MCP server in "${relPath}" appears to construct SQL queries by concatenating strings (including user input). This is a SQL injection vulnerability. If the MCP tool accepts user-controlled parameters, attackers can execute arbitrary SQL.`,
                severity: 'critical',
                category: 'security',
                file,
                fixable: 'manual',
                confidence: confidence(80),
                tags: ['mcp', 'security', 'sql-injection'],
                evidence: [
                    createEvidence('text', { label: 'pattern', excerpt: 'string concatenation in SQL' }),
                ],
                suggestedFix: `Use parameterized queries: \`db.query('SELECT * FROM users WHERE id = $1', [userId])\` instead of string concatenation. Never put user input directly in SQL strings.`,
            }));
        }
        return findings;
    }
    checkSecretLeakage(relPath, content, file) {
        const findings = [];
        // Check if tools or resources return secrets in responses
        const secretPatterns = [
            { re: /return\s*\{[^}]*token|return\s*\{[^}]*api_key|return\s*\{[^}]*secret|return\s*\{[^}]*password/gi, label: 'returning secrets in response' },
            { re: /process\.env\.\w+|os\.environ\.get\(/i, label: 'accessing env vars in tool' },
        ];
        const hasToolImpl = /call_tool|execute|handleRequest/i.test(content);
        for (const { re, label } of secretPatterns) {
            re.lastIndex = 0;
            if (re.test(content) && hasToolImpl) {
                findings.push(createFinding({
                    id: `mcp-secret-leak-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `Potential secret leakage in MCP tool response: ${label} in ${relPath}`,
                    explanation: `The MCP server in "${relPath}" appears to include secrets (tokens, API keys, passwords) in tool responses. MCP tool responses are visible to LLM clients — secrets in responses can be leaked to the conversation.`,
                    severity: 'critical',
                    category: 'security',
                    file,
                    fixable: 'manual',
                    confidence: confidence(80),
                    tags: ['mcp', 'security', 'secret-leakage'],
                    evidence: [
                        createEvidence('text', { label: 'pattern', excerpt: label }),
                    ],
                    suggestedFix: `Never return secrets in tool responses. Use secrets only for internal operations and redact them from any returned data. Consider returning only identifiers or references, not the actual secret values.`,
                }));
            }
        }
        return findings;
    }
    checkToolSchemas(relPath, content, file) {
        const findings = [];
        // Check for overly broad schemas (e.g., any type, empty object)
        const broadSchemaPatterns = [
            { re: /inputSchema:\s*\{\s*\}/i, label: 'empty inputSchema (no validation)' },
            { re: /inputSchema:\s*\{[^}]*type:\s*["']object["'][^}]*\}/i, label: 'unconstrained object schema' },
            { re: /type:\s*["']any["']|type:\s*["']string["']\s*\?\s*:|optional.*:.*any/gi, label: 'any-type fields' },
        ];
        for (const { re, label } of broadSchemaPatterns) {
            if (re.test(content)) {
                findings.push(createFinding({
                    id: `mcp-broad-schema-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `MCP tool has overly broad schema: ${label} in ${relPath}`,
                    explanation: `The MCP tool in "${relPath}" has an input schema with ${label}. This provides no guidance to LLM clients about valid inputs, leading to malformed requests and runtime errors.`,
                    severity: 'low',
                    category: 'maintainability',
                    file,
                    fixable: 'manual',
                    confidence: confidence(70),
                    tags: ['mcp', 'schema', 'validation', 'maintainability'],
                    evidence: [
                        createEvidence('text', { label: 'pattern', excerpt: label }),
                    ],
                    suggestedFix: `Define precise JSON Schema types for all tool inputs: specify required fields, property types (string/number/boolean), string formats (e.g., format: 'uri'), and enum constraints where applicable.`,
                }));
            }
        }
        return findings;
    }
}
//# sourceMappingURL=McpRuntimeAnalyzer.js.map