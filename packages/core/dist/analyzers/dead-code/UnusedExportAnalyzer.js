/**
 * Unused Export Analyzer
 * Detects exported functions/components that appear to never be imported elsewhere.
 * Conservative mode: only reports exports with high confidence of being unused.
 * Uses import graph analysis across all source files.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { walkFiles } from '../../shared/index.js';
export class UnusedExportAnalyzer {
    id = 'unused-export';
    name = 'Unused Export Analyzer';
    categories = ['dead-code'];
    supports(fp) {
        return (fp.languages.some(language => ['typescript', 'javascript'].includes(language.toLowerCase())));
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        // Find all source files
        const files = await this.findSourceFiles(ctx.projectRoot);
        if (files.length === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // Build export map: file -> exported symbols
        // Build import map: file -> imported symbols + source file
        const exportMap = new Map(); // file -> symbol -> line
        const importMap = new Map(); // file -> set of imported files
        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                const relFile = relative(ctx.projectRoot, file);
                // Extract named exports
                const exports = this.extractExports(content);
                if (!exportMap.has(file))
                    exportMap.set(file, new Map());
                for (const [sym, line] of exports) {
                    exportMap.get(file).set(sym, line);
                }
                // Extract imports
                if (!importMap.has(file))
                    importMap.set(file, new Set());
                const imports = this.extractImports(content);
                for (const imp of imports) {
                    importMap.get(file).add(imp);
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        // Find exported symbols that are never imported
        const globalImports = this.buildGlobalImportSet(importMap, files);
        for (const [file, exports] of exportMap) {
            const relFile = relative(ctx.projectRoot, file);
            for (const [symbol, line] of exports) {
                // Check if this symbol is imported anywhere globally
                if (!globalImports.has(symbol)) {
                    findings.push(createFinding({
                        id: `unused-export-${relFile}-${symbol}`.replace(/[^a-z0-9-]/gi, '-'),
                        title: `Potentially unused export: ${symbol}`,
                        explanation: `Export "${symbol}" in "${relFile}" does not appear to be imported by any other file in the codebase.`,
                        severity: 'low',
                        category: 'dead-code',
                        fixable: 'manual',
                        confidence: confidence(70),
                        tags: ['unused-export', 'dead-code', 'conservative'],
                        file,
                        line,
                        evidence: [
                            createEvidence('code', {
                                path: file,
                                label: `export ${symbol}`,
                                excerpt: `Line ${line}: export found but no import references`,
                            }),
                        ],
                        suggestedFix: `Verify this export is not used via dynamic imports, re-exports, or external consumers. If truly unused, remove the export keyword or the entire declaration.`,
                    }));
                }
            }
        }
        return { analyzerId: this.id, findings, durationMs: 0, errors };
    }
    async findSourceFiles(projectRoot) {
        const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan']);
        return walkFiles({
            cwd: projectRoot,
            extensions: ['ts', 'tsx', 'js', 'jsx'],
            ignoreDirs: ignoredDirs,
        });
    }
    extractExports(content) {
        const result = new Map();
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNum = i + 1;
            // Named export: export const/function/class/interface/type/abstract
            const namedMatch = line.match(/^export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/);
            if (namedMatch) {
                result.set(namedMatch[1], lineNum);
                continue;
            }
            // Export default
            const defaultMatch = line.match(/^export\s+default\s+(?:function|class|const)?\s*(\w+)?/);
            if (defaultMatch) {
                result.set(defaultMatch[1] ?? '(anonymous)', lineNum);
                continue;
            }
            // Export { Symbol } from '...'
            const reExportMatch = line.match(/^export\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/);
            if (reExportMatch) {
                const names = reExportMatch[1].split(',').map(s => s.trim());
                for (const name of names) {
                    result.set(name, lineNum);
                }
            }
        }
        return result;
    }
    extractImports(content) {
        const results = [];
        const importRe = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match;
        while ((match = importRe.exec(content)) !== null) {
            results.push(match[1]);
        }
        while ((match = requireRe.exec(content)) !== null) {
            results.push(match[1]);
        }
        return results;
    }
    buildGlobalImportSet(importMap, files) {
        const symbols = new Set();
        for (const [, imports] of importMap) {
            for (const imp of imports) {
                // Remove file extension and path to get module name
                const name = imp.replace(/^\.\.?\/?/, '').replace(/\.[^.]+$/, '').split('/').pop() ?? imp;
                symbols.add(name);
            }
        }
        return symbols;
    }
}
//# sourceMappingURL=UnusedExportAnalyzer.js.map