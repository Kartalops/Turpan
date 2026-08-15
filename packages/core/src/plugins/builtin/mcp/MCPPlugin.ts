/**
 * MCP Plugin — specialized review skills for MCP (Model Context Protocol) servers.
 *
 * Contributes:
 *  - MCP server safety checks
 *  - Tool definition validation
 *  - Resource handler checks
 *  - Security review for tool calls
 */

import { readFileSync } from 'fs';
import type { Plugin, PluginManifest } from '../../Plugin.js';
import type { PluginContext } from '../../PluginContext.js';
import type { PluginRegistry } from '../../PluginRegistry.js';
import type { ProjectFingerprint } from '../../../project/index.js';
import type { Finding, Category } from '../../../findings/Finding.js';
import type { Analyzer, AnalyzerContext } from '../../../analyzers/Analyzer.js';
import { walkFiles } from '../../../shared/index.js';
import { confidence, createFinding } from '../../../findings/Finding.js';
import { createEvidence } from '../../../findings/Evidence.js';

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest: PluginManifest = {
  id: 'mcp',
  name: 'MCP Server Review Skills',
  version: '0.1.0',
  description: 'Specialized analyzers for MCP servers: tool safety, resource access, security, schema validation',
  dependsOn: [],
};

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const mcpPlugin: Plugin = {
  manifest,

  supports(fp: ProjectFingerprint): boolean {
    if (fp.appType === 'mcp-server') return true;
    const files = fp.detectedFiles ?? [];
    const hasMcpFiles = files.some((f: string) =>
      /mcp[_-]?server|model[_-]?context[_-]?protocol|mcp[_-]?tools|mcp[_-]?resources/i.test(f)
    );
    return hasMcpFiles;
  },

  register(registry: PluginRegistry, _ctx: PluginContext): void {
    registry.registerAnalyzer(createMCPAnalyzer(), manifest.id);

    registry.registerRuleset({
      id: 'mcp-security',
      label: 'MCP Server Security Rules',
      additive: true,
      rules: `\
mcp-tool-safety:
  require-input-schema: true
  max-tool-name-length: 64
  severity: high

mcp-resource-access:
  validate-uris: true
  block-file-absolute-paths: true
  allow-list-based: true
  severity: critical

mcp-server:
  require-timeout: true
  require-cancellation: true
  log-all-requests: true
  severity: high
`,
    }, manifest.id);
  },
};

// ── MCP Analyzer ───────────────────────────────────────────────────────────────

function createMCPAnalyzer(): Analyzer {
  return {
    id: 'mcp-specific',
    name: 'MCP Server Specific Analyzer',
    categories: ['mcp', 'security', 'api-design'],

    supports(fp: ProjectFingerprint): boolean {
      if (fp.appType === 'mcp-server') return true;
      const files = fp.detectedFiles ?? [];
      return files.some((f: string) =>
        /mcp[_-]?server|model[_-]?context[_-]?protocol/i.test(f)
      );
    },

    async run(ctx: AnalyzerContext): Promise<{
      analyzerId: string;
      findings: Finding[];
      artifacts?: Record<string, unknown>;
      durationMs: number;
      errors: string[];
    }> {
      const start = Date.now();
      const findings: Finding[] = [];
      const artifacts: Record<string, unknown> = {};

      try {
        const tsFiles = walkFiles({
          cwd: ctx.projectRoot,
          extensions: ['ts', 'js'],
          ignoreDirs: new Set(['node_modules', '.git', 'dist', 'build']),
          maxDepth: 5,
        });

        // Filter to likely MCP-related files by content
        const mcpFiles: string[] = [];
        for (const file of tsFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (/\bmcp|MCP|tool\s*\(|resource\s*\(|setRequestHandler|listTools|listResources/i.test(content)) {
            mcpFiles.push(file);
          }
        }

        artifacts['mcpFileCount'] = mcpFiles.length;

        // ── Check for arbitrary shell execution in tool handlers ────────────
        const shellExecHits: Array<{ file: string; line: number; excerpt: string }> = [];
        const SHELL_EXEC_RE = /(?:child_process|exec|spawn|execSync)\s*\(.*(?:shell\s*:?\s*true|\b\/bin\/sh\b|\bbash\b)/i;

        for (const file of mcpFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*#/.test(line)) continue;
            if (SHELL_EXEC_RE.test(line)) {
              const relPath = file.startsWith(ctx.projectRoot)
                ? file.slice(ctx.projectRoot.length + 1)
                : file;
              shellExecHits.push({
                file: relPath,
                line: i + 1,
                excerpt: line.trim().slice(0, 120),
              });
            }
          }
        }

        if (shellExecHits.length > 0) {
          findings.push(createFinding({
            id: 'mcp-arbitrary-shell-exec',
            title: `MCP tool allows arbitrary shell execution (${shellExecHits.length} location(s))`,
            explanation:
              `Found ${shellExecHits.length} instance(s) of shell command execution in MCP tool handlers. ` +
              `Arbitrary shell execution is a critical security risk — any compromised input can lead to ` +
              `full server compromise. Use parameterized command execution or a sandboxed subprocess.`,
            severity: 'critical',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(90),
            suggestedFix: 'Remove shell: true or use execFile with explicit argument arrays instead of shell strings.',
            tags: ['mcp', 'security', 'shell-injection', 'critical'],
            evidence: shellExecHits.slice(0, 5).map(h => createEvidence('code', {
              label: 'Shell execution in MCP tool',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── Check for unvalidated file path operations ─────────────────────
        const unsafePathHits: Array<{ file: string; line: number; excerpt: string }> = [];
        const UNSAFE_PATH_RE = /(?:readFile|readFileSync|writeFile|writeFileSync|open|createReadStream)\s*\([^)]*\)/;
        const VALIDATED_PATH_RE = /(?:realpath|resolve|isInsideWorkspace|isAllowed|validatePath|path\.join\([^)]+\)\s*===?)/i;

        for (const file of mcpFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          // Check if file has any path validation
          const hasValidation = VALIDATED_PATH_RE.test(content);

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*#/.test(line)) continue;
            if (UNSAFE_PATH_RE.test(line) && !VALIDATED_PATH_RE.test(line)) {
              const relPath = file.startsWith(ctx.projectRoot)
                ? file.slice(ctx.projectRoot.length + 1)
                : file;
              unsafePathHits.push({
                file: relPath,
                line: i + 1,
                excerpt: line.trim().slice(0, 120),
              });
              break; // one finding per file
            }
          }
        }

        if (unsafePathHits.length > 0) {
          findings.push(createFinding({
            id: 'mcp-unsafe-filesystem',
            title: `MCP tools permit arbitrary filesystem path readFileSync access without workspace bounds (${unsafePathHits.length} file(s))`,
            explanation:
              `Found ${unsafePathHits.length} MCP tool(s) that perform file operations without ` +
              `apparent path validation. Without validation, malicious input could read or write ` +
              `arbitrary files outside the intended workspace. Use realpath() and allowlist checks.`,
            severity: 'critical',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(80),
            suggestedFix: 'Validate paths with realpath() and check they are within the allowed workspace directory.',
            tags: ['mcp', 'security', 'path-traversal', 'filesystem', 'critical'],
            evidence: unsafePathHits.slice(0, 5).map(h => createEvidence('code', {
              label: 'Unvalidated file operation',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── Check for missing timeout on async functions ───────────────────
        const noTimeoutHits: Array<{ file: string; line: number; excerpt: string }> = [];
        const ASYNC_FUNC_RE = /async\s+(?:function\s+\w+|\w+\s*=\s*(?:async\s+)?\(|function\s+\w+)\s*\([^)]*\)/;
        const TIMEOUT_RE = /(?:timeout|AbortSignal|signal\s*\.|setTimeout|CancellationToken)/i;

        for (const file of mcpFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          // Skip if already has shell exec finding (already critical)
          if (shellExecHits.some(h => h.file === file)) continue;

          const hasTimeout = TIMEOUT_RE.test(content);
          if (!hasTimeout) {
            const relPath = file.startsWith(ctx.projectRoot)
              ? file.slice(ctx.projectRoot.length + 1)
              : file;
            noTimeoutHits.push({
              file: relPath,
              line: 1,
              excerpt: `Async handler in ${relPath} has no timeout/abort signal`,
            });
          }
        }

        if (noTimeoutHits.length > 0) {
          findings.push(createFinding({
            id: 'mcp-missing-timeout',
            title: `${noTimeoutHits.length} MCP handler(s) lack timeout/cancellation support`,
            explanation:
              `Found ${noTimeoutHits.length} MCP handler(s) that do not appear to implement ` +
              `timeouts or cancellation (AbortSignal). Long-running operations can block the ` +
              `entire server. All async handlers should support AbortSignal or cancellation tokens.`,
            severity: 'high',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(75),
            suggestedFix: 'Accept AbortSignal as a parameter and check it in long-running operations.',
            tags: ['mcp', 'reliability', 'security'],
            evidence: noTimeoutHits.slice(0, 5).map(h => createEvidence('code', {
              label: 'No timeout support',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

      } catch (err) {
        return {
          analyzerId: 'mcp-specific',
          findings: [],
          durationMs: Date.now() - start,
          errors: [err instanceof Error ? err.message : String(err)],
        };
      }

      return {
        analyzerId: 'mcp-specific',
        findings,
        artifacts,
        durationMs: Date.now() - start,
        errors: [],
      };
    },
  };
}
